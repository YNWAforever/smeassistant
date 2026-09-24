# P3.4 — Reliable scan events and the weekly value metric

**Date:** 2026-09-24
**Plan item:** Master Implementation Plan §6, P3.4 · sources D5, D7, F-34
**Status:** design approved, not yet implemented

## Why

The product claims to be judged by one number — weekly businesses completing a
useful approved delivery — and nothing computes it. Beneath that, the funnel
events it would sit on are being silently dropped in production.

F-34 recorded `event_record_failed { category: "backend_unavailable" }` nine
times across `/api/scan/start` and `/api/scan/process`. Tracing current `main`
(`ed23418`) shows the defect is still live and worse than recorded:

1. **The 250 ms budget still applies.** `recordEvent` in the vendored engine
   uses `context.timeoutMs ?? 250`. The host wrapper
   `lib/analytics/record-event.ts` passes `context` straight through; its 2000 ms
   default belongs to `forwardEventToPostHog` only. Neither call site sets
   `timeoutMs`.
2. **The budget has to cover four round trips.** `eventRepository().insert`
   does `pool.connect()` — a cold Neon TLS handshake alone can exceed 250 ms —
   then `BEGIN; SET LOCAL statement_timeout`, the `INSERT`, and `COMMIT`.
3. **The failure feeds itself.** On abort the insert calls `release(true)`,
   destroying the connection. A timeout discards the one connection that had
   finally warmed, so the next event starts cold again.
4. **`scan_started` has a second loss path.** `scan/start` does
   `void recordEvent(...)` with no `waitUntil` or `after()`. On Vercel the
   function may freeze once the response is sent. `scan_completed` does pass
   `waitUntil`, so the two events are lost at different rates and the ratio
   between them is skewed as well as the totals.
5. **Deduplication never fires.** The unique index
   `scan_events_dedupe_identity_unique_idx` covers
   `(job_id, anonymous_session_id, event_name, dedupe_key)` with no
   `NULLS NOT DISTINCT`, and neither call site supplies a `dedupe_key`. Postgres
   treats NULLs as distinct, so `ON CONFLICT DO NOTHING` never matches. This is
   masked today only because events are dropped rather than retried; any retry
   added without a key would turn undercounting into overcounting.

## The approach

**Read authoritative records; close the race instead of widening it.**

`scan_started` means an `audit_jobs` row was created. `scan_completed` means
that row reached a terminal status. Both facts are already durable. The event
rows in `scan_events` are a lossy copy of them. So:

- The report computes every funnel step from authoritative business tables and
  never depends on `scan_events` for a number it can get elsewhere.
- The two scan events are written **inside the transaction that records the
  fact they describe**, so they cannot be lost independently of it.
- `scan_events` is kept honest by a printed reconciliation against `audit_jobs`,
  which is also how the fix is verified once deployed.

Rejected: a durable outbox drained by the cron dispatch (a new table and a fifth
cron concern, built for events whose facts are already in `audit_jobs`), and a
raised budget alone (widens the race rather than removing it, and the plan
permits a revised budget only where *measured* to be sufficient — there is no
measurement).

## 1. Reliable scan events

### Where each event is written

| Event | Written inside | How |
|---|---|---|
| `scan_started` | `jobsRepository.insert` (`lib/repositories/jobs.ts`), already `withTransaction` | one `INSERT` beside the `audit_jobs` and consent rows |
| `scan_completed` (done / partial) | `persist()` in `lib/scan/execution-store.ts`, already `withTransaction` | one `INSERT` after the status `UPDATE` |
| `scan_completed` (failed) | `fail()` in the same file, today a single autocommit `UPDATE` | a CTE: `WITH u AS (UPDATE … RETURNING id) INSERT INTO scan_events … SELECT … FROM u` |

The `fail()` CTE matters: its `UPDATE` is guarded by
`status IN ('collecting','scoring','persisting')`. Because the insert selects
from the `UPDATE`'s `RETURNING`, a job that was already terminal produces no
second event.

`scan/start` resolves the analytics session **before** calling
`insertScanJob` rather than after, as it does today, so the session id is
available inside the transaction. The fire-and-forget `void recordEvent(...)`
is removed.

### Deterministic dedupe keys

Every event carries a fixed `dedupe_key`: `started` for `scan_started`,
`terminal` for `scan_completed`. With `job_id` and `event_name` already in the
unique index, `ON CONFLICT DO NOTHING` now matches, and a retried `persist()`
cannot write a second row.

The existing index is **not** changed to `NULLS NOT DISTINCT`. Supplying the
key is sufficient for every event this app writes, and rewriting an index on a
shared analytics table is a larger change than the defect requires.

### The PostHog trap

`recordTerminal` still runs after `persist()`/`fail()` and today calls
`recordEvent`, which **inserts first**. With the row already written
in-transaction, that insert hits the conflict and returns `inserted: false`,
and the vendored `recordEvent` then returns early at its
`if (inserted && !inserted.inserted)` branch — **skipping PostHog forwarding**.
Left alone, PostHog would silently stop receiving `scan_completed`.

So `recordTerminal` calls `forwardEventToPostHog` directly. The database write
moves into the transaction; only the transport stays after it. The same applies
to `scan_started`, forwarded after the job transaction commits.

### Validation before the transaction

Writing the event inside the transaction means an event-insert failure fails
the transaction — which is the point, but would let a malformed event block a
scan from persisting. Each event is therefore validated with the engine's
`parseScanEvent` **before** the transaction opens. Inside it, the insert can
only fail in the ways any other statement in that transaction could.

### The vendored package is not edited

`insert` is host-supplied storage by design (the engine's own comment: "Host
supplies storage and transport; the engine never reads credentials"), and
`persist`, `fail` and `recordTerminal` are host implementations of the store
interface. No change to `packages/scan-engine`, and no `VENDOR.md` entry.

## 2. Marking internal workspaces

### Migration `neon/migrations/0008_workspace_internal.sql`

```sql
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
```

`NOT NULL DEFAULT false`, mirroring `is_demo`. Unlike
`verification_checked_at` there is no meaningful unknown: a workspace is staff
or test data or it is not, and every existing row is correctly `false` except
the staff-assigned `nadagogo`. No index — the report reads a handful of rows
once a week.

It inherits the `workspaces` table's existing RLS and grant block; no policy or
grant is added.

### Kept separate from `is_demo`

Demo means *fixed, sanitised sample data, shown publicly*. Internal means *real
data that is not a customer*. Folding them together would invite someone to set
`is_demo` on a staff workspace and publish it on the demo page.

### Setting it

A hand-run statement recorded in the runbook, not a feature:

```sql
UPDATE workspaces SET is_internal = true WHERE slug = 'nadagogo';
```

No UI, API or operator toggle until there is more than one person to mark.

### Carried forward from P3.2

Schema drift went unnoticed in P3.2 until the integration suite failed four
tasks later. These are first-class steps here, not afterthoughts:

- the Drizzle column in `lib/db/schema/business.ts` beside `isDemo`;
- the `test/integration/neon-schema.integration.test.ts` baseline and its
  catalog fixture;
- the `db:verify` catalog delta **predicted before running it** — +1 column,
  +0 indexes — so the baseline stays a guard rather than a transcript of
  whatever the command printed.

### Deploy ordering

The report reads `is_internal`. Run against a database where 0008 has not been
applied, it fails with *column does not exist* — the same class of drift
suspected behind the production `home lookup failed` 500. Because the report is
a CLI and not a page, nothing user-facing can break; the phase report states
that 0008 must be applied (DEC-11, an owner action) before running it against
production.

## 3. What the report counts

**Week:** ISO week as the half-open interval `[Monday 00:00, next Monday 00:00)`
in `Asia/Hong_Kong`. Half-open, so an event at exactly midnight belongs to one
week only. Hong Kong and Taiwan are both UTC+8, so one boundary serves both
markets without splitting a business's week.

**Assisted claims are not read from `workspace_access_requests`.** That table
records only `resolved_at` and `resolved_by_staff_user_id`; a resolved request
may equally be a rejection. The decision is recorded in `audit_events`
(`lib/repositories/access-requests.ts`): approval writes `workspace.assigned`,
which is the event that corresponds to actually receiving a workspace.

**Exclusions:** workspaces with `is_demo = true` or `is_internal = true` are
excluded from every workspace-scoped line, and the number excluded is printed.

Every line names its source table and its denominator.

### Primary metric

**Weekly businesses with a useful approved delivery**: distinct
`actions.location_id` having at least one `deliveries` row with
`counted = true` and `created_at` in the week, joined
`deliveries.version_id → output_versions.id → output_versions.action_id →
actions.id`.

`counted` is set by `export_output_version` only on the **first** export of an
**approved** version, so generated drafts, regenerations and repeat exports of
the same version cannot inflate it.

**Distinct workspaces** with a qualifying delivery is printed beside it as the
separate account metric. The two are never substituted for each other.

**Deliveries with no location.** `actions.location_id` is NULL for
workspace-wide actions. Assigning those to a primary location would invent an
attribution; dropping them would undercount. They are printed as their own
line — *N deliveries with no location* — excluded from the location count and
included in the workspace count.

### Funnel

Each step is reported against the step above it.

| Step | Source |
|---|---|
| Scan started | `audit_jobs` rows with `created_at` in the week |
| Usable scan completed — **full** / **partial** | `status = 'done'` / `status = 'partial'`; `failed` printed separately |
| First sign-in | `app_users.created_at` — the row is created on a user's first verified sign-in. **Not workspace-scoped**, so the exclusions cannot apply; staff sign-ins are included and the line says so |
| Claim completed — **supported** / **assisted** | `workspace_claim_events` (OAuth-verified) / `audit_events` where `event = 'workspace.assigned'` |
| First real draft | earliest `output_versions` row per location falls in the week |
| First approved export | earliest `counted` delivery per location falls in the week |
| Repeat weekly export | counted delivery this week **and** in at least one earlier week |
| Task failure | `action_runs.state IN ('failed','timed_out')` |
| Missing input | `actions.action_state = 'needs_input'` |
| Paid conversion | printed **not measurable — billing unavailable (DEC-09)**, never `0` |

### Limitations printed on every run

- **Sign-in and claim *started* are not durably recorded.** Recording them
  would mean extending the vendored event allowlist in `parseScanEvent`, so they
  are printed as *not measured*. Only assisted claims have a start timestamp
  (`workspace_access_requests.requested_at`).
- **Scans cannot be classified as internal until they are claimed.** A
  public-funnel scan has no workspace, so `is_internal` cannot reach it. Staff
  test scans — including the seven Nadagogo scans — count in the top of the
  funnel, and the report says so.

### Reconciliation

For the week: `audit_jobs` started versus `scan_events` rows named
`scan_started`, and terminal `audit_jobs` versus `scan_completed`, with each gap
printed as a count. After deploy this should approach zero for new weeks; past
weeks will keep showing the historical loss.

### No targets

No targets, thresholds or pass/fail judgements. There is no measured baseline,
and inventing one is the fabrication the product's own guardrails forbid.

## 4. The script

**Command:** `corepack pnpm report:value`, implemented at
`scripts/report/value.ts` and run with `tsx`, like the existing scripts.

### Target confirmation

It follows `neon:readiness` exactly. It refuses to connect unless
`VALUE_REPORT_HOST` and `VALUE_REPORT_DATABASE` are set and match
`DATABASE_URL` after canonicalising the `-pooler` host suffix. A leftover
`DATABASE_URL` in a shell cannot silently aim it at the wrong database.

The matching logic is extracted from `scripts/neon/readiness.ts` into
`scripts/neon/target.ts` and used by both scripts. Two copies of a safety check
drift apart; this is the one targeted improvement in the phase.

### Read-only, enforced by the database

All queries run inside `BEGIN TRANSACTION READ ONLY`, so a future edit that
writes by mistake is rejected by Postgres rather than by convention. It
connects with the application runtime role, never the owner role.

### Arguments and output

- `--week 2026-W38`. The default is the **last complete week**, never the
  current partial one, which would read as a drop that is not real.
- Plain-text table by default: each metric with numerator, denominator, source,
  and the exclusion and limitation lines above.
- `--json` emits the same data.
- **Counts only.** No emails, business names or workspace slugs. Excluded
  internal workspaces appear as a number.

### Errors

Fixed categories — `configuration`, `target`, `query_failed` — with no
connection strings, SQL or row data in the message. Unlike the page-side
`read()` wrapper that reduced the production 500 to `home lookup failed`, the
underlying error is attached as `cause` and printed to the operator's terminal.
This is a CLI run by the operator; there is no client to shield, and discarding
the cause would repeat the diagnostic failure that wrapper caused.

## 5. Testing

Against disposable Docker Postgres (`NEON_INTEGRATION=1`), because every claim
here concerns transaction boundaries and SQL, which mocks cannot check:

- **Atomicity in both directions.** A committed job has exactly one
  `scan_started`; a rolled-back job insert leaves neither row. Likewise
  `persist()` and `scan_completed`.
- **`fail()`'s guard.** An event is written only when the `UPDATE` matched; an
  already-terminal job produces no second event.
- **Dedupe works.** A retried `persist()` yields one row. Mutation-checked:
  with the key removed, the test must observe two.
- **The PostHog trap.** With the row already written in-transaction,
  `recordTerminal` still delivers `scan_completed` to the PostHog transport.
  Named separately, as the regression most likely to return.
- **Every report metric** against one fixture containing demo, internal and
  external workspaces; counted and uncounted deliveries; a repeat exporter; and
  a NULL-location action. **Each exclusion is mutation-checked**: removing the
  `is_internal` or `is_demo` filter makes a named test fail.
- **Read-only is real.** A write attempted inside the report transaction is
  rejected.
- **Target refusal.** A mismatched host or database stops the script before it
  connects.

Also: `db:verify` with the predicted delta, Drizzle and schema-test baselines,
and the full offline gate inventory. `build` is expected to remain **blocked**
on the Windows development machine by the standing Turbopack/`radix-ui`
cascade and is recorded as such, with `next build --webpack` as a separately
labelled diagnostic.

## What this does not prove

- **Production reliability.** That requires 0008 applied (DEC-11), a deploy,
  and the reconciliation gap observed near zero on real traffic. Until then the
  work is *locally verified*, not *hosted verified*.
- **Recovery of past losses.** Historical `scan_events` stay undercounted and
  past-week reconciliation will keep showing the gap. The primary metric is
  unaffected, because it never reads `scan_events`.
- **PostHog delivery**, which remains best-effort.
- **Sign-in and claim *started***, which remain unmeasured; top-of-funnel scan
  counts that include staff testing; and paid conversion, which cannot be
  measured while billing is unavailable.
- **Phase 3's hosted acceptance gate**, which is still blocked by the
  unresolved production `home lookup failed` 500.
