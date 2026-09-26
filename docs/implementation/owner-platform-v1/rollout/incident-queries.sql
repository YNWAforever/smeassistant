-- Incident queries (P3.5d). Referenced by name from INCIDENT-RUNBOOK.md.
-- Every block is one statement. "read" blocks are SELECT-only and are tested
-- inside a READ ONLY transaction; "write" blocks are the documented changes.
-- Paste one block at a time into the Neon SQL Editor.

-- name: scan_backlog
-- mode: read
SELECT status, count(*)::int AS jobs, min(created_at) AS oldest_created, max(last_attempt_at) AS newest_attempt
FROM audit_jobs WHERE status IN ('queued','collecting','scoring','persisting')
GROUP BY status ORDER BY status;

-- name: dead_lettered_scans
-- mode: read
SELECT id, business_name, status, attempt_count, last_attempt_at, workspace_id
FROM audit_jobs
WHERE status IN ('collecting','scoring','persisting') AND attempt_count >= 3
  AND last_attempt_at IS NOT NULL AND last_attempt_at < now() - interval '30 minutes'
ORDER BY last_attempt_at LIMIT 50;

-- name: failed_scans_by_category_24h
-- mode: read
SELECT coalesce(failure_category, 'unknown') AS category, count(*)::int AS scans
FROM audit_jobs WHERE status = 'failed' AND coalesce(completed_at, created_at) > now() - interval '24 hours'
GROUP BY 1 ORDER BY scans DESC;

-- name: spend_24h
-- mode: read
SELECT (SELECT count(*)::int FROM scan_attempts WHERE attempted_at > now() - interval '24 hours') AS scan_attempts,
       (SELECT coalesce(sum(cost_usd), 0)::numeric(12,4) FROM action_runs WHERE created_at > now() - interval '24 hours') AS ai_usd;

-- name: google_connection_states
-- mode: read
SELECT status, count(*)::int AS connections FROM oauth_connections WHERE provider = 'google_gbp' GROUP BY status ORDER BY status;

-- name: schedule_states
-- mode: read
SELECT cadence, count(*)::int AS schedules, min(next_run_at) AS next_due FROM scan_schedules GROUP BY cadence ORDER BY cadence;

-- name: recent_tier_events
-- mode: read
SELECT workspace_id, tier, source, stripe_event_id, created_at
FROM workspace_tier_events WHERE created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 100;

-- name: pause_all_schedules
-- mode: write
-- Keep the returned ids: resume_schedules needs exactly these.
UPDATE scan_schedules SET cadence = 'paused' WHERE cadence = 'monthly' RETURNING id;

-- name: resume_schedules
-- mode: write
-- Replace __SCHEDULE_IDS__ with the ids pause_all_schedules returned, as '{id1,id2}'.
UPDATE scan_schedules SET cadence = 'monthly' WHERE cadence = 'paused' AND id = ANY('__SCHEDULE_IDS__'::uuid[]) RETURNING id;
