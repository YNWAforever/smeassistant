# P3.5b — Failure and retry view: design

**Date:** 2026-09-25 · **Branch:** `p35b-failure-view` (stacked on `p35a-spend-budgets`, PR #21) · **Status:** approved in brainstorming, awaiting spec review

## Why

Master Plan §6 P3.5 asks for "integration-health and actionable failure notices visible to operators; useful, localized owner next steps without secrets or stack traces" and "authorized dead-letter/retry controls, correlation IDs and a support view that respects tenant/location access". §P1 (line 188) also asks for "a terminal failure/retry state instead of orphaned `running` work".

Today:

- A scan that exhausts its 3 claim attempts stays in `collecting|scoring|persisting` forever. Nothing shows it, nothing closes it, and the owner's **Resume** button is a dead end (`claim` returns `already_claimed`).
- Scan failures store `failure_category` + `failure_correlation_id`; draft-run failure reasons live only in `audit_events` payloads; Google connection problems show only on the owner's integrations page; post-processing retries (`workspace_scan_completions` in `retry`) are invisible.
- The one operator role (`OPERATOR_EMAILS`, `lib/auth/operator.ts`) gates only the access-request queue.

## Decisions (user, 2026-09-25)

| Question | Decision |
|---|---|
| Who it serves | **Operator + owner**: an operator failure queue and owner-side failure notices |
| Failure kinds | **Scans** (failed + dead-lettered), **AI draft runs**, **Google connection**, **workspace post-processing** |
| Dead-lettered scans | **Auto-close + release**: the cron tick closes them after a grace period; before that an operator can release one more attempt on the same job |
| Owner surface | **Home "Needs attention" card + Activity "Problems & recovery" section** |
| Approach | **A — read model over existing tables** (no new table; derived from the rows that are the actual state) |

Out of scope, by the same decisions: mail (nothing sends yet; P3.5c), budget/rate-limit refusals and cron step failures (log-only; would need a table), operator alerting, acknowledge/assign state.

**Consent boundary (why operators cannot retry most failures).** A new scan needs the owner's own fresh consent (`lib/workspace/rescan.ts:159-172`: the consent is supplied by the caller, never synthesised). An operator therefore cannot create a replacement scan. Failed scans and failed drafts stay the owner's to retry; Google reconnection needs the owner's own OAuth; post-processing already retries every 5 minutes. The only operator control is releasing a **dead-lettered** job, which already carries its consent.

## 1. Failure model — `lib/ops/failures.ts`

```ts
type FailureKind =
  | "scan_failed" | "scan_dead_lettered" | "draft_failed"
  | "google_connection" | "workspace_processing";

type OwnerAction = "rescan" | "contact_support" | "open_action" | "reauthorise" | "ask_owner" | "none";

type FailureItem = {
  kind: FailureKind;
  id: string;                        // source row id (job id, run id, connection id)
  reference: string;                 // SCAN-XXXXXX (job) | RUN-XXXXXX (run) | CONN-XXXXXX (connection)
  correlationId: string | null;      // audit_jobs.failure_correlation_id, scans only
  occurredAt: string;                // ISO
  workspace: { id: string; slug: string; name: string } | null;
  locationId: string | null;
  actionId: string | null;           // draft_failed only
  businessName: string;
  reason: string;                    // allowlisted code only, never provider text
  attempts: number | null;
  operatorAction: "release" | "none";
};
```

`reference` for scans is the existing `scanReference(jobId)` display ID (`lib/funnel/scan-progress.ts:118`) owners already see. Run and connection references use the same `PREFIX-` + first 6 hex characters, upper-cased.

### Sources

| Kind | Rows | Reason | Window |
|---|---|---|---|
| `scan_failed` | `audit_jobs.status='failed'` | `failure_category` (processor categories, `consent_missing`, `consent_policy_stale`, new `ATTEMPTS_EXHAUSTED`) | `completed_at` within 30 days |
| `scan_dead_lettered` | in flight (`collecting|scoring|persisting`), `attempt_count >= 3`, `last_attempt_at` older than 30 minutes | `ATTEMPTS_EXHAUSTED` | until closed |
| `draft_failed` | `action_runs.state IN ('failed','timed_out')` | `payload.reason` of the run's `run.failed` / `run.timed_out` audit event (`action_run_timeout`, `invalid_output`, `action_run_failed`, `action_run_reaped`); `action_run_failed` when none | `finished_at` (else `created_at`) within 14 days, and no later `succeeded` run on the same action |
| `google_connection` | `oauth_connections.provider='google_gbp'`, `status IN ('expired','revoked','error')` | the status | while the workspace has no `active` google_gbp row |
| `workspace_processing` | `workspace_scan_completions.state='retry'`, `attempts >= 3` | `last_error` (`workspace_post_process_failed`) | while in retry |

**Dead-letter condition.** `DEAD_LETTERED_JOB_CONDITION_SQL` is defined next to `CLAIMABLE_JOB_CONDITION_SQL` in `lib/scan/claimable.ts` and states the exact complement of its in-flight branch (in flight, `attempt_count >= 3`, `last_attempt_at IS NOT NULL AND last_attempt_at < now()-interval '30 minutes'`). A guard test proves a stale in-flight job matches exactly one of the two. The query uses the existing partial index `audit_jobs_stale_claim_idx`.

### Two readers

- **`listOperatorFailures({ kind?, search? , limit })`** — cross-tenant, newest first, capped (200). `search` matches a reference (`SCAN-…`, `RUN-…`, `CONN-…`, case-insensitive), a full job/run id, or a correlation id. Every `FailureItem` field is safe to show an operator: business name and workspace slug/name, never emails, contact identifiers, review text, draft bodies, `action_runs.error` text or raw provider messages. The SQL selects only allowlisted columns.
- **`operatorHealth()`** — counts by kind for the last 24 h and 7 days, plus failed scans grouped by `failure_category` for the same windows (the provider-outage signal).
- **`listWorkspaceProblems(workspaceId, membership)`** — one workspace. Drops `workspace_processing` (nothing for an owner to do). Applies location scope: a manager with a non-null `location_scope` sees only items whose `locationId` is in scope; items with `locationId = null` (workspace-wide, e.g. Google) are visible to every member. Returns items plus `ownerAction` resolved by role and tier (§3).

Both readers fail loudly (throw); callers decide how to degrade (§4).

## 2. Dead-letter handling

### Auto-close sweep (cron `dispatch` tick)

New isolated step in `app/api/cron/dispatch/route.ts`, after reclaim: `closeExhaustedScans(limit 20)` in `lib/repositories/dead-letter.ts`.

- Selects up to 20 jobs matching `DEAD_LETTERED_JOB_CONDITION_SQL AND last_attempt_at < now() - interval '24 hours'` (the **grace period** during which an operator can release).
- Per job, one transaction: a guarded `UPDATE audit_jobs SET status='failed', processing_stage='failed', failure_category='ATTEMPTS_EXHAUSTED', failure_correlation_id=gen_random_uuid(), completed_at=now() WHERE id=$1 AND <dead-lettered> AND last_attempt_at < now()-interval '24 hours' RETURNING …`. A job released or claimed in between no longer matches and is skipped.
- When the update matched: write the job's `scan_completed` event (outcome `failed`, coverage 0, `SCAN_TERMINAL_DEDUPE_KEY`) via `writeScanEventSafely` in a SAVEPOINT, exactly as `jobsRepository.failQueued` does, so P3.4's reconciliation gains no gap; and record `scan.auto_closed` (actor `system`, workspace = the job's workspace or null, entity `audit_job`, payload `{ attempts }`).
- `collecting|scoring|persisting → failed` is an allowed transition (`packages/contracts/src/job-state.ts`); the vendored packages are unchanged.
- Workspace jobs then flow through the existing completion outbox (`pending_workspace_completions` already includes `failed`), which sends the existing `scan.failed` in-app notification. No new notification code.
- The step is best-effort like the others: failures log `cron_dispatch_step_failed`, never block reclaim, and the tick's JSON summary gains `autoClosed: n`.

### Release control

`POST /api/ops/failures/scans/[jobId]/release`

- `resolveOperator()`; non-operator → **404** (matches the ops pages' hidden-route convention). Invalid UUID → 404.
- One guarded update: `UPDATE audit_jobs SET attempt_count=2 WHERE id=$1 AND <dead-lettered> RETURNING attempt_count_before` (via a CTE reading the old value). Under the unchanged lease rule (`attempt_count < 3`) that grants exactly one more attempt on the **same job, share slug and consent**.
- No match → **409 `not_dead_lettered`** (already closed, claimed, or released by someone else). Concurrent releases: one 200, one 409.
- On success: record `ops.scan.released` (actor `user` = operator's `app_users.id`, workspace = job's or null, entity `audit_job`, payload `{ previous_attempts, operator_email }`), then dispatch best-effort the same way cron does (`fetch(${APP_ORIGIN}/api/scan/process)` under `waitUntil`). If dispatch fails or `APP_ORIGIN` is unset, the next cron tick reclaims it. Response `200 { released: true, dispatched: boolean }`.
- The retry claim remains budget-checked (P3.5a `retry_claim`); an `at_capacity` refusal leaves the job claimable. `scan_attempts` keeps the true attempt history; the audit event keeps the previous counter.
- No per-job release cap: each release is a deliberate, audited human act bounded by the spend budget.
- Rate limit: none beyond operator gating (operators are an explicit allowlist).

### Audit event names

`ops.scan.released` and `scan.auto_closed` are added to `AUDIT_EVENTS` (a TypeScript tuple; no database constraint) and to `lib/workspace/audit-labels.ts` so the owner Activity page labels `scan.auto_closed` in all three locales. Queue views are **not** logged: the access-request precedent logs only when a merchant's details are opened and calls per-queue-view logging noise; this queue shows no personal data.

## 3. Surfaces

### Operator page — `/[locale]/ops/failures`

- `requireOperator()` (404 otherwise), `robots: noindex`, English-only by the same recorded exception as `/ops/access-requests`.
- **Health strip:** 24 h / 7 d counts by kind; failed scans by `failure_category`.
- **Filter** by kind (query param `kind`) and **search** by reference/id (query param `q`), server-rendered GET form.
- **Rows:** kind, reference (+ correlation id when present), business name, workspace slug as plain text (operators have no membership, so no link), reason code with a plain-English meaning, attempts, occurred-at. **Release** button (small client component posting to the release route, showing the 409 message inline) on `scan_dead_lettered` rows only.
- Explicit error state when the reader throws; never an empty queue on failure.
- A small ops nav (`components/ops/ops-nav.tsx`) links Failures and Access requests on both pages.

### Owner side

`listWorkspaceProblems` feeds both surfaces; components compose existing classes (`section-card`, `brief-*`, `page-intro`) and shadcn primitives.

- **Home — "Needs attention" card** (`components/workspace/needs-attention-card.tsx`): up to two items for the current `?location=` scope, one line each (what happened + next step) with its button. Hidden when there are none.
- **Activity — "Problems & recovery" section** (`components/workspace/problems-list.tsx`) at the top: every item with what happened, what to do next, the reference, and the button.

**Owner-action matrix** (resolved server-side in `lib/ops/owner-actions.ts`; the UI only renders it):

| Kind | owner / manager in scope | manager out of scope · viewer |
|---|---|---|
| `scan_failed` | paid tier → `rescan` (existing rescan route, budgets and rate limit); lite tier → `contact_support` ("Contact Fimmick with reference SCAN-…", the market's contact channel from `MARKETS`) | `none` (notice only) |
| `scan_dead_lettered` | `none` — "This scan stopped responding. It closes automatically within 24 hours; you can then rescan." | same |
| `draft_failed` | `open_action` → the action's detail page to re-run; reason via the existing `draftFailure` labels plus timeout/reaped labels | `none` |
| `google_connection` | owner → `reauthorise` (existing `/api/oauth/google/start` link); manager → `ask_owner` | `none` |

Location scope for the matrix uses the existing `inLocationScope` (`lib/auth.ts:50`).

### Public scanning page

- `GET /api/scan/status` gains an additive `deadLettered: boolean` (computed with `DEAD_LETTERED_JOB_CONDITION_SQL` in `jobsRepository.readStatus`; upstream's other fields unchanged).
- When `deadLettered` is true, `components/scanning-page.tsx` shows a dedicated state instead of the dead-end **Resume** button: "This scan stopped responding. It will close automatically within 24 hours — you can start a new scan any time. Reference SCAN-…", with a link to `/scan`.

### Copy

- New owner strings in a `problems` namespace in `lib/messages/{en,zh-HK,zh-TW}.json` (zh-HK 香港書面中文, zh-TW 台灣用語), plus the scanning-page dead-letter strings in `lib/copy.ts` next to `funnel.scanning`.
- Every reason code maps to a label; an unknown code falls back to a generic line. A raw code is never shown to an owner.
- Targeted fix: `components/workspace/action-detail-client.tsx:259` currently falls back to the raw error code in a toast; it uses the generic line instead.

## 4. Error handling

- **Owner pages never break on the model.** If `listWorkspaceProblems` throws, Home and Activity render without the card/section and log `console.error("[ops] problems_unavailable", { category: "ops_problems_unavailable" })`. They never show a false "no problems" message (the card is simply absent).
- **Operator page shows an explicit error**, never an empty queue.
- **Auto-close** is bounded (20 per tick), per-job transactional, and isolated from the other tick steps.
- **Release** is idempotent in effect (guarded update matches once).
- **Privacy by construction:** allowlisted SELECT columns; a test per reader asserts that seeded personal fields (member emails, lead contact identifiers, review text, draft bodies, `action_runs.error`) never appear in serialized output.

## 5. Testing

- **Unit:** each source row → `FailureItem`; reason labels for every known code + fallback, in all three locales; the owner-action matrix row by row (role × tier × scope); location-scope filtering; reference formatting; the dead-letter/claimable complement guard test.
- **Integration (`NEON_INTEGRATION=1`, Docker, real migrations and runtime role):**
  - dead-lettered job listed; auto-closed after 24 h but not at 23 h; a job released or claimed in between is not closed;
  - auto-close writes exactly one `scan_completed` (failed, coverage 0) and one `scan.auto_closed`;
  - release makes the job claimable exactly once; the next claim is budget-checked and writes one `scan_attempts` row; concurrent double-release → one success, one `not_dead_lettered`;
  - a draft item disappears after a later successful run on the same action;
  - a Google item appears only without an active connection;
  - an out-of-scope manager never sees another location's items;
  - operator reader output contains no seeded personal fields.
- **Routes:** release — non-operator 404, bad id 404, 409 when not dead-lettered, 200 with dispatch attempted; status route returns `deadLettered`; cron tick summary includes `autoClosed`.
- **Components:** Home card hidden with no problems; right button per role; scanning page never shows Resume when `deadLettered`; the action-detail toast never shows a raw code.
- **Mutation checks:** break each key guard (dead-letter condition, grace interval, release guard, scope filter, personal-field allowlist) and confirm its named test fails, as in P3.5a.

## 6. Known limits (to record in the Phase 3 report)

- No operator alerting (email/pager): operators must open the queue. Waits for the P3.5c outbox.
- No acknowledge/assign state; the queue empties as problems resolve.
- No per-job release cap; the spend budget bounds cost.
- Budget/rate-limit refusals and cron step failures stay log-only.
- Auto-close depends on the cron tick, which needs `CRON_SECRET` in production (same dependency as reclaim).
- The failed-scan window query has no dedicated index (`status='failed'` scan over `audit_jobs`); acceptable at pilot volume, same class as P3.5a M7.
- No migration. If implementation finds one is needed, stop and ask before adding it.
