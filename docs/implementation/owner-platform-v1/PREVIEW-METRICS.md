# P4.5 preview metrics (DEC-12 success and failure measures)

Read-only SQL for the unsaved preview draft (spec [`2026-10-04-preview-draft-design.md`](../../superpowers/specs/2026-10-04-preview-draft-design.md) §6). There is no dashboard. Paste one query at a time into the Neon SQL Editor. Every query is a single `SELECT`, so it is safe to run inside `BEGIN READ ONLY; … ROLLBACK;`.

**Status.** These queries need migration `0013_preview_events.sql`, which has **not** been applied to any hosted database. They were run only against an owned, disposable local Docker `postgres:16` with `0001`–`0013` and synthetic rows (see "How these queries were checked" below). Nothing here has been measured in production, and hosted acceptance was not run.

## What `preview_events` records, and what it does not

`preview_events` is the only thing the preview writes. It has no text column: no review, reply, prompt, contact detail or raw IP. One row per slot decision:

| `outcome` | Written when | `reason` |
|---|---|---|
| `claimed` | `claim_preview_slot` granted the slot; the model call is in progress | null |
| `generated` | the draft was returned to the visitor (`finish_preview_slot`) | null |
| `failed` | the model gave no output, invalid output, or asked for facts; or a claim was older than 5 minutes when the next claim ran | `no_output`, `invalid_output`, `facts_needed`, `stale` |
| `refused` | `claim_preview_slot` refused | `already_used`, `job_limit`, `daily_limit`, `budget` |

Every row except `refused` is one model call (ruling R11). A `failed` row releases the grant's single success and the job's slot (the per-grant "already used" check and the per-job limit of 3 count only `claimed` and `generated`), but it **does** count toward the daily limit (`PREVIEW_DRAFT_DAILY_LIMIT`), toward the grant's cap of 3 attempts, and its `cost_usd` toward the daily budget. `refused` rows never count toward anything.

**Refusals that happen before the claim are not in this table.** The route refuses `paused` (AI kill switch), `ip_limit` (5 per IP per day), and `unavailable` (invalid limit override, limiter outage, claim error) before it reaches `claim_preview_slot`, and `invalid_input` (400) and every 404 (flag off, unknown slug, job not `done`/`partial`, no valid viewer grant) earlier still. Those appear only in the application logs, as `[api/start/preview] refused` with `{ category: "preview_<reason>" }` (`preview_paused`, `preview_ip_limit`, `preview_limits_invalid`, `preview_limiter_unavailable`, `preview_claim_failed`), plus `preview_eligibility_failed` and `preview_finish_failed` from `console.error`. Count them from the logs; the SQL below cannot see them.

**Days.** The daily caps (`PREVIEW_DRAFT_DAILY_LIMIT`, `PREVIEW_DRAFT_USD_DAILY`) are rolling 24-hour windows, not calendar days. The per-day queries below group by calendar day in `Asia/Hong_Kong` (UTC+8, which is also Taiwan time) for reading; the "last 24 hours" query matches what the limits see.

## 1. Previews generated per day

```sql
SELECT (created_at AT TIME ZONE 'Asia/Hong_Kong')::date AS day_hkt,
       count(*) FILTER (WHERE outcome = 'generated')::int AS generated,
       count(DISTINCT job_id) FILTER (WHERE outcome = 'generated')::int AS jobs_with_a_draft,
       count(*) FILTER (WHERE outcome IN ('generated', 'failed'))::int AS slots_finished,
       count(*) FILTER (WHERE outcome = 'claimed')::int AS still_claimed
FROM public.preview_events
GROUP BY 1
ORDER BY 1 DESC
LIMIT 60;
```

`slots_finished` counts slots that reached an end state, `generated` or `failed`; a `failed`/`stale` row is a request that never finished, so it may or may not have reached the model. `still_claimed` should be 0 for any day but today; a claimed row older than 5 minutes is turned into `failed`/`stale` by the next claim.

## 2. Refusals by reason

```sql
SELECT (created_at AT TIME ZONE 'Asia/Hong_Kong')::date AS day_hkt, reason, count(*)::int AS refusals
FROM public.preview_events
WHERE outcome = 'refused'
GROUP BY 1, 2
ORDER BY 1 DESC, refusals DESC
LIMIT 200;
```

Only the four claim-time reasons can appear (`already_used`, `job_limit`, `daily_limit`, `budget`). `already_used` is the expected answer to a repeat request from the same grant, and to a fourth attempt after three failed ones; a rising `daily_limit` or `budget` count means the global cap, not abuse by one visitor, is doing the refusing.

## 3. Failures by reason

```sql
SELECT (created_at AT TIME ZONE 'Asia/Hong_Kong')::date AS day_hkt, reason, count(*)::int AS failures,
       coalesce(sum(cost_usd), 0)::numeric(12,4) AS usd
FROM public.preview_events
WHERE outcome = 'failed'
GROUP BY 1, 2
ORDER BY 1 DESC, failures DESC
LIMIT 200;
```

`no_output` (no model answer, including the AI pause backstop in `llmComplete`), `invalid_output` (the answer failed the review-reply schema), `facts_needed` (the model asked for facts, so nothing was shown), `stale` (a request that never finished). The visitor sees `unavailable` for every one of them. The slot is released, so the grant may try again, but each failure counts toward the daily limit and toward the grant's 3 attempts.

## 4. Daily cost

```sql
SELECT (created_at AT TIME ZONE 'Asia/Hong_Kong')::date AS day_hkt,
       coalesce(sum(cost_usd), 0)::numeric(12,4) AS usd,
       coalesce(sum(cost_usd) FILTER (WHERE outcome = 'generated'), 0)::numeric(12,4) AS usd_generated,
       coalesce(sum(cost_usd) FILTER (WHERE outcome = 'failed'), 0)::numeric(12,4) AS usd_failed
FROM public.preview_events
GROUP BY 1
ORDER BY 1 DESC
LIMIT 60;
```

What the budget check sees right now (the same window and sum as `claim_preview_slot`):

```sql
SELECT coalesce(sum(cost_usd), 0)::numeric(12,4) AS usd_last_24h,
       count(*) FILTER (WHERE outcome IN ('claimed', 'generated', 'failed'))::int AS slots_last_24h
FROM public.preview_events
WHERE created_at > now() - interval '24 hours';
```

Compare `usd_last_24h` with `PREVIEW_DRAFT_USD_DAILY` (default 2) and `slots_last_24h` with `PREVIEW_DRAFT_DAILY_LIMIT` (default 50); `slots_last_24h` counts `claimed`, `generated` and `failed` (stale included), exactly as the daily limit does. Cost is computed from the model's reported usage by `computeCostUsd` and the `LLM_COST_PER_1K_*` rates. When the provider reports no usage, or the call returned nothing, the route records a conservative estimate instead of 0 (ruling R11): `ceil(prompt length / 2)` input tokens and the full `maxTokens` (1,200) output tokens, at the same rates. Preview cost is **not** in `action_runs.cost_usd`, so the workspace AI budget and the `spend_24h` incident query do not include it.

## 5. Claim-after-preview rate

Spec §6: jobs with a `generated` preview whose job later has `audit_jobs.workspace_id` set through a verified claim, divided by jobs with a `generated` preview. Ruling R12: a job that was already attached before its first `generated` preview can only be a non-event, so it is excluded from **both** the numerator and the denominator; the rate measures attaches that happened after the preview, among jobs that could still be attached.

`audit_jobs.workspace_id` is written once (`UPDATE … WHERE workspace_id IS NULL`) and only by the verified attach paths: the Google-verified claim, which writes a `workspace_claim_events` row, and assisted assignment by an operator, which writes an `audit_events` row with `event = 'workspace.assigned'` and `payload->>'job_id'`. The email-match self-service claim stays disabled (`OWNER_SELF_SERVICE_CLAIM` unset, enforced by `test:no-self-service-claim`). "Later" is the first of those two attach records after the job's first `generated` preview:

```sql
WITH previewed AS (
  SELECT job_id, min(created_at) AS first_generated_at
  FROM public.preview_events
  WHERE outcome = 'generated'
  GROUP BY job_id
), attached AS (
  SELECT p.job_id, p.first_generated_at, j.workspace_id,
         least(
           (SELECT min(c.created_at) FROM public.workspace_claim_events c WHERE c.job_id = p.job_id),
           (SELECT min(e.created_at) FROM public.audit_events e
             WHERE e.event = 'workspace.assigned' AND e.payload->>'job_id' = p.job_id::text)
         ) AS verified_at
  FROM previewed p
  JOIN public.audit_jobs j ON j.id = p.job_id
)
SELECT count(*)::int AS jobs_with_generated_preview,
       count(*) FILTER (WHERE workspace_id IS NOT NULL AND verified_at <= first_generated_at)::int AS excluded_attached_before_preview,
       count(*) FILTER (WHERE workspace_id IS NOT NULL AND verified_at IS NULL)::int AS excluded_attach_unrecorded,
       count(*) FILTER (WHERE workspace_id IS NULL OR verified_at > first_generated_at)::int AS eligible_jobs,
       count(*) FILTER (WHERE workspace_id IS NOT NULL AND verified_at > first_generated_at)::int AS claimed_after_preview,
       round(100.0 * count(*) FILTER (WHERE workspace_id IS NOT NULL AND verified_at > first_generated_at)
             / nullif(count(*) FILTER (WHERE workspace_id IS NULL OR verified_at > first_generated_at), 0), 1) AS claim_after_preview_pct
FROM attached;
```

`claim_after_preview_pct` is `claimed_after_preview / eligible_jobs`. `eligible_jobs` is every job with a `generated` preview except the two excluded groups, which are reported separately and appear in neither the numerator nor the denominator: `excluded_attached_before_preview` (the job already belonged to a workspace when its first preview was generated; a viewer grant can exist for an attached job) and `excluded_attach_unrecorded` (the job is attached but neither attach record exists, so "after the preview" cannot be shown). So `jobs_with_generated_preview = excluded_attached_before_preview + excluded_attach_unrecorded + eligible_jobs`. The rate is an association, not a cause: it says nothing about visitors who claimed without trying a preview. To read it against a baseline, compute the same share for unlocked jobs with no preview:

```sql
SELECT count(*)::int AS unlocked_jobs_without_preview,
       count(*) FILTER (WHERE j.workspace_id IS NOT NULL)::int AS attached,
       round(100.0 * count(*) FILTER (WHERE j.workspace_id IS NOT NULL) / nullif(count(*), 0), 1) AS attached_pct
FROM public.audit_jobs j
WHERE j.status IN ('done', 'partial')
  AND EXISTS (SELECT 1 FROM public.report_access_grants g WHERE g.job_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.preview_events p WHERE p.job_id = j.id AND p.outcome = 'generated');
```

Run both over the same period after the flag has been on long enough to matter; the queries carry no date filter, so add `AND created_at >= '<start>'` to the `previewed` CTE and `AND j.created_at >= '<start>'` to the baseline when comparing a window.

## Erasure and retention

`preview_events.job_id` cascades, so erasing a job erases its preview trail and its rows leave every count above. `grant_id` is set null when a grant is revoked or deleted, so the cost record survives. Turning the flag off keeps the rows; these queries still work.

## How these queries were checked

On 2026-10-04 every query above was run, inside a read-only transaction, against a disposable local `postgres:16` with `0001`–`0013` applied by the repository runner and a few synthetic jobs, grants, `preview_events`, `workspace_claim_events` and `workspace.assigned` audit rows; each returned the expected counts for that fixture. After the final-review fix wave (rulings R11 and R12) they were run again, the same way, against a fresh fixture that adds a job attached before its preview, an attached job with no attach record and a stale row; every count matched (recorded in `PHASE-4-TEST-RESULTS.md`, "P4.5 final-review fix wave"). They have never been run against a hosted database.
