# Incident runbook (P3.5d)

Named SQL blocks referenced below (`` `query:<name>` ``) live in
[`rollout/incident-queries.sql`](rollout/incident-queries.sql). That file is
the source of truth; a test (`lib/ops/incident-queries.test.ts`) fails the
build if this document names a block the file does not have, or the file has
a block this document never names.

## 1. Purpose and ownership

This is what to do when something is wrong in production: a provider is down,
scans are stuck, drafting is failing, scheduling looks paused, billing events
are out of sync, or a bad deploy needs to come back out.

No accountable incident owner or on-call rota is named yet (DEC-06). Whoever
is on call for this app uses this document. Nothing in it has been rehearsed
on hosted infrastructure — the integration tests prove the SQL runs correctly
against a real migrated schema in Docker, not that anyone has done this drill
against Neon or Vercel for real. Read it once before an incident, not during
one.

## 2. First five minutes

1. Open `/ops/failures` (the operator page). Read the health strip: a spike in
   `COLLECTION_FAILED` scans usually means a provider outage; a run of failed
   draft runs usually means the LLM gateway; note the open counts for both.
   If either kill switch (§3) is already on, the page shows a banner naming
   it — read that before you assume nothing has been done yet.
2. Search Vercel logs for these tags:

   | Tag | What it means |
   |---|---|
   | `[budget] refused` | A scan or AI request hit its spend budget (P3.5a), not an incident by itself. |
   | `[budget] check_failed` | The budget check itself could not run (bad config or an unreadable count) — every request in scope was refused, fail-closed. |
   | `[pause] refused` | A kill switch (§3) is on and refused this request. |
   | `[pause] configuration_invalid` | A pause variable holds something other than `true` or unset/empty — treated as paused, on both switches, until fixed. |
   | `cron_dispatch_step_failed` | One step of the 5-minute cron tick failed; the tag's `step` field says which (`reclaim_abandoned_scans`, `close_exhausted_scans`, `reconcile_stuck_completions`, `verify_website_actions`, `notify_due_schedules`). |
   | `event_write_failed` | A scan analytics event (`scan_started` / `scan_completed`) failed to record; the scan itself still committed. It shows up as a counted gap in the weekly value report's reconciliation. |

3. Run `neon:readiness` (read-only, target-guarded — it only inspects the
   configured target, it never writes).
4. Run `query:scan_backlog` and `query:spend_24h` for a first read on how much
   work is stuck and how much has been spent in the last 24 hours.

## 3. Kill switches

Two environment variables stop provider and AI spend without a migration and
without losing queued work. `readPauseConfig` (`lib/budgets/pause.ts`) treats
unset or empty as off, exactly `"true"` as on, and **any other value as
paused** (`yes`, `1`, `TRUE`, `false` all included) — logged as
`[pause] configuration_invalid` on every request it affects, until fixed. An operator who mistypes the value must not
believe spend is still flowing, so a typo pauses rather than passes through.

| Variable | Effect when `true` | Keeps working |
|---|---|---|
| `SCANS_PAUSED` | Refuses `POST /api/scan/start` and rescan (`503 { error: "paused" }`), refuses claiming a queued job at `POST /api/scan/process` (`503 paused`), refuses the paid business-search steps `POST /api/business/search` and `POST /api/business/ig-search` (`503 paused`), and the cron tick skips the reclaim dispatch (logs `[pause] refused` with `entry: "retry_claim"`, one line, not per job). | Report reading, approvals, exports, the operator page. The cron's auto-close, reconcile and website verification steps still run — none of them spends provider money. Queued jobs are untouched: no `attempt_count` or `scan_attempts` row changes, so nothing is lost. |
| `AI_DRAFTS_PAUSED` | Refuses an owner draft run (`503 { error: "ai_paused" }`, surfaced by Create as `201 { runError: "ai_paused" }`) and an assistant draft, both before any model call or run row exists. `llmComplete` (`lib/llm.ts`) itself returns `null` while paused, as a backstop for every other caller (report summaries, translation) — those already degrade on `null`. | Everything that does not call the LLM: reading, approving and exporting existing drafts. |

**Containment note.** `SCANS_PAUSED` stops the paid business-search routes as
well as scan start/rescan/claim, so it fully contains an incident whose
source is SerpApi, RapidAPI or Google Places — there is no remaining path in
this app that still calls those providers while it is on (the review for
P3.5d checked every runtime mode and the vendored packages). `AI_DRAFTS_PAUSED`
equally contains an LLM gateway incident: every call goes through
`llmComplete`, which is gated, and the vendored packages make no LLM calls of
their own.

**The cron.** `vercel.json` runs `POST /api/cron/dispatch` every 5 minutes. It
answers 401 unless `CRON_SECRET` is set, so without that secret none of its
steps run. Unsetting `CRON_SECRET` (and redeploying) stops all of them together:
the reclaim of queued and abandoned scans, auto-close of stuck scans, the
workspace-completion reconcile, website verification and schedule
notifications. That is a bigger hammer than `SCANS_PAUSED`, which only skips
the reclaim.

**How to apply one.** Set the variable in Vercel (Production environment)
and redeploy, or re-promote the current deployment — environment variable
changes take effect on the *next* deployment, not on the running one, so a
plain variable edit with no redeploy does nothing. Confirm the change took
effect by reloading `/ops/failures` and reading the banner; it is the fastest
way to know the switch is actually live, faster than trusting the Vercel
dashboard alone. Expect roughly 1–2 minutes end to end.

**Known gap.** A scanning page a visitor already has open when `SCANS_PAUSED`
turns on shows no pause message until they press Resume: the page's automatic
first `/api/scan/process` call on load discards the response it gets back, so
a `503 paused` from that first call is silent. Only the explicit Resume
button surfaces the paused copy. There is no fix for this today; if you need
visitors mid-scan to see the message immediately, there isn't one — they see
it once they interact with the page.

**How to lift.** Unset the variable (or set it back to unset/empty — do not
leave a stray `false`, which is itself an invalid value and pauses) and
redeploy the same way. Queued scans resume via the cron reclaim (which needs
`CRON_SECRET`; see "The cron" above — watch `query:scan_backlog` drain) or an
owner's Resume click; queued AI work has no equivalent backlog — an
owner simply retries the draft.

## 4. Scenario 1: provider disabled or failing

Providers: SerpApi, RapidAPI (Instagram), Google Places, the LLM gateway.

- **Detect.** `query:failed_scans_by_category_24h` for a spike in one failure
  category; the `/ops/failures` health strip; repeated `[budget] check_failed`
  or plain provider error logs naming the same provider.
- **Contain.** Either turn on the matching kill switch (`SCANS_PAUSED` for a
  scan-side provider, `AI_DRAFTS_PAUSED` for the LLM gateway) and redeploy, or
  remove just that one provider's API key from the environment and redeploy.
  The trade-off: pausing stops *all* scans; removing one key lets scans keep
  running with that module `unavailable` and lower coverage (never a lower
  score — guardrail: unavailable ≠ zero). Prefer removing the single key when
  only one provider is affected and scans are otherwise healthy.
- **Recover.** Restore the key or unset the pause variable, redeploy. Check
  `query:dead_lettered_scans` for jobs stuck past three attempts and 30
  minutes; release any from `/ops/failures`. Queued jobs resume through the
  cron reclaim (needs `CRON_SECRET` — see "The cron" in §3) or the owner's own
  Resume.
- **Verify.** `query:scan_backlog` drains back toward zero in the non-terminal
  statuses over the following cron ticks.
- **Record.** See §9.

## 5. Scenario 2: Google authorisation expired or revoked

This cannot currently happen through any automatic path: there is no token
refresh loop and nothing expires a connection on a timer
(`lib/repositories/claims.ts`'s `replaceGoogleConnection` only ever moves a
connection through `expired` as a transient state inside one transaction, on
its way to `active`, when the *owner* reconnects). A `revoked` row is the
owner's own disconnect, not something that happens to them.

- **Detect.** `query:google_connection_states` for a count by status.
- **Recover.** Only the owner can act: Settings → Integrations → reconnect.
  Operators have no control over this and no server-side action to take.
- **Record.** Note that this was observed at all; it is not expected to occur
  in this app's current design and may point at a bug if it does.

## 6. Scenario 3: paused scheduling

Schedules (`scan_schedules`) only **notify** — they never dispatch a scan
themselves. Pausing a schedule stops the "your monthly scan is due" nudge,
nothing more.

- **Detect.** `query:schedule_states` for the count by cadence.
- **Pause all.** Run `query:pause_all_schedules` and **keep the returned ids**
  — you need exactly these to resume the right ones later, not "whatever is
  paused now" (a schedule an owner paused themselves must not be woken up by
  your resume).
- **Resume.** Run `query:resume_schedules`, substituting the kept ids for
  `__SCHEDULE_IDS__` as a Postgres array literal (`{id1,id2}`). If the
  placeholder is pasted unreplaced, Postgres rejects the statement (invalid
  uuid[] literal) and nothing changes.
- **Distinguish from stopping the cron.** Unsetting `CRON_SECRET` also stops
  the schedule notifications, but it stops far more at the same time: reclaim,
  auto-close and reconcile all stop too ("The cron" in §3). Pausing schedules here is a
  narrower action than that.

## 7. Scenario 4: failed billing synchronisation

Billing is off in this deployment (DEC-08/09) — no live Stripe integration is
active. This scenario is written for when it is turned on.

- **Detect.** `query:recent_tier_events` against the Stripe dashboard's event
  log for the same window; a gap means an event never landed.
- **Recover.** Resend the missing event from the Stripe dashboard. The
  webhook handler is idempotent on `stripe_event_id`, so a resend is safe to
  repeat.
- **Never.** Do not hand-edit `workspaces.tier`. Every tier change must come
  through the webhook (or a recorded staff grant) so `workspace_tier_events`
  stays the true history of why a workspace is on the tier it is on.

## 8. Scenario 5: rollback that preserves history

Roll back the **application build only** — a Vercel promote to a previous
deployment or an instant rollback. Never roll back the schema, delete rows, or
restore a database snapshot over live data.

Migrations are additive-only, so an older build keeps running correctly on a
newer schema, but it loses whatever protection the newer build added. In
particular:

- Rolling back past **P3.5d** loses the kill switches themselves — a provider
  or LLM incident during that older build can no longer be paused this way.
- Rolling back past **P3.5b** loses auto-close and release: stuck scans pile
  up instead of being closed or released for retry.
- Rolling back past **P3.5a** loses budget enforcement entirely: nothing caps
  scan or AI spend.

Restoring a database snapshot, or otherwise reverting rows, destroys real
history that nothing else records: approvals (`output_versions`), deliveries
(`deliveries`), delivery allowance usage (`workspace_usage`), billing history
(`workspace_tier_events`), the audit trail (`audit_events`), and the spend log
(`scan_attempts`). None of that can be reconstructed after the fact — treat it
as permanently gone the moment it is overwritten.

Neon point-in-time restore is for forensics only, and only into a **separate**
branch — never restored back over the live database. The default response to
a bad change is a forward fix (a new, reviewed commit), not a rollback of data;
any correction is a new row, never an edit of an old one.

## 9. Recording an incident

Write down, as it happens or immediately after:

- Start and end time (your local clock is fine; note the timezone).
- Which kill switch(es) were used, when set and when lifted.
- Every `query:<name>` run, when, and its output (row counts are enough for
  read queries; for `pause_all_schedules` record the exact ids returned).
- Any jobs released from `/ops/failures`, by id.
- Any redeploy or promote/rollback performed, with the deployment id.

Append a dated section to `PHASE-3-TEST-RESULTS.md` until this app has a
dedicated incident log. Do not just say "handled" — write enough that someone
else could reconstruct what happened from your notes alone.

## 10. Appendix — every query

| Block | What it does |
|---|---|
| `query:scan_backlog` | Counts non-terminal `audit_jobs` by status, with the oldest and most recently attempted. |
| `query:dead_lettered_scans` | Lists jobs stuck past three attempts and 30 minutes since the last attempt. |
| `query:failed_scans_by_category_24h` | Counts failed scans in the last 24 hours by failure category. |
| `query:spend_24h` | One row: scan attempts and recorded AI cost (US$) in the last 24 hours. |
| `query:google_connection_states` | Counts Google Business Profile connections by status. |
| `query:schedule_states` | Counts `scan_schedules` by cadence, with the earliest next-due. |
| `query:recent_tier_events` | The last 7 days of `workspace_tier_events`, newest first. |
| `query:pause_all_schedules` | **Write.** Sets every `monthly` schedule to `paused`; returns the affected ids — keep them. |
| `query:resume_schedules` | **Write.** Sets exactly the given ids back to `monthly` from `paused`. |
