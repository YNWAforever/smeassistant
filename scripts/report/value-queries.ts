import type { PoolClient } from "pg";
import { REPORT_TIMEZONE, type ReportWeek } from "./week";

/**
 * Every number comes from an authoritative business table. scan_events is read
 * only for reconciliation, never for a count the business tables can supply.
 * $1 is the week start (inclusive) and $2 the end (exclusive).
 */
export const LIMITATIONS = [
  "Sign-in and claim started are not durably recorded; only assisted claims have a request timestamp.",
  "Public-funnel scans cannot be classified internal until claimed, so staff test scans count in the scan totals.",
  "First sign-ins read app_users, which is not workspace-scoped: staff sign-ins are included.",
  "Missing input is a snapshot at report time, not a count for the week.",
  "Reconciliation covers every job, internal included: it checks the pipeline, not the customers.",
] as const;

export interface ValueReport {
  week: { label: string; start: string; end: string; timezone: typeof REPORT_TIMEZONE };
  exclusions: { demoWorkspaces: number; internalWorkspaces: number };
  primary: { locations: number; eligibleLocations: number; workspaces: number; eligibleWorkspaces: number; deliveriesWithoutLocation: number };
  scans: { started: number; completedFull: number; completedPartial: number; failed: number; inProgress: number };
  signIns: { first: number };
  claims: { supported: number; assisted: number };
  deliveryFunnel: { firstDraft: number; firstApprovedExport: number; repeatWeeklyExport: number };
  tasks: { runs: number; failed: number; missingInputNow: number };
  paidConversion: { measurable: false; reason: string };
  reconciliation: { jobsStarted: number; startedEvents: number; jobsTerminal: number; completedEvents: number };
  limitations: readonly string[];
}

type Row = Record<string, number>;
type Client = Pick<PoolClient, "query">;

/** Workspace eligibility, for a join aliased `w`. */
const ELIGIBLE = "NOT w.is_demo AND NOT w.is_internal";

/** deliveries → output_versions → actions, tenant-matched at every hop. */
const DELIVERY_JOIN = `
  FROM deliveries d
  JOIN output_versions v ON v.id = d.version_id AND v.workspace_id = d.workspace_id
  JOIN actions a ON a.id = v.action_id AND a.workspace_id = v.workspace_id
  JOIN workspaces w ON w.id = d.workspace_id`;

async function row(client: Client, sql: string, values: unknown[] = []): Promise<Row> {
  return ((await client.query(sql, values)).rows[0] ?? {}) as Row;
}

export async function collectValueReport(client: Client, week: ReportWeek): Promise<ValueReport> {
  const window = [week.start.toISOString(), week.end.toISOString()];

  const exclusions = await row(client, `
    SELECT count(*) FILTER (WHERE is_demo)::int AS demo,
           count(*) FILTER (WHERE is_internal AND NOT is_demo)::int AS internal
    FROM workspaces`);

  // count(DISTINCT location_id) ignores NULLs, so a location-less delivery is
  // excluded from the location count and still counted for its workspace.
  const primary = await row(client, `
    SELECT count(DISTINCT a.location_id)::int AS locations,
           count(DISTINCT d.workspace_id)::int AS workspaces,
           count(*) FILTER (WHERE a.location_id IS NULL)::int AS without_location
    ${DELIVERY_JOIN}
    WHERE d.counted AND d.created_at >= $1 AND d.created_at < $2 AND ${ELIGIBLE}`, window);

  const eligible = await row(client, `
    SELECT (SELECT count(*)::int FROM workspaces w WHERE ${ELIGIBLE}) AS workspaces,
           (SELECT count(*)::int FROM locations l JOIN workspaces w ON w.id = l.workspace_id WHERE ${ELIGIBLE}) AS locations`);

  // A cohort: scans started this week, with their status as of report time.
  const scans = await row(client, `
    SELECT count(*)::int AS started,
           count(*) FILTER (WHERE j.status = 'done')::int AS full,
           count(*) FILTER (WHERE j.status = 'partial')::int AS partial,
           count(*) FILTER (WHERE j.status = 'failed')::int AS failed,
           count(*) FILTER (WHERE j.status NOT IN ('done','partial','failed'))::int AS in_progress
    FROM audit_jobs j
    LEFT JOIN workspaces w ON w.id = j.workspace_id
    WHERE j.created_at >= $1 AND j.created_at < $2
      AND NOT coalesce(w.is_demo OR w.is_internal, false)`, window);

  const signIns = await row(client,
    "SELECT count(*)::int AS first FROM app_users WHERE created_at >= $1 AND created_at < $2", window);

  const claims = await row(client, `
    SELECT (SELECT count(DISTINCT e.workspace_id)::int FROM workspace_claim_events e
              JOIN workspaces w ON w.id = e.workspace_id
             WHERE e.created_at >= $1 AND e.created_at < $2 AND ${ELIGIBLE}) AS supported,
           (SELECT count(DISTINCT e.workspace_id)::int FROM audit_events e
              JOIN workspaces w ON w.id = e.workspace_id
             WHERE e.event = 'workspace.assigned' AND e.created_at >= $1 AND e.created_at < $2 AND ${ELIGIBLE}) AS assisted`, window);

  const funnel = await row(client, `
    SELECT
      (SELECT count(*)::int FROM (
         SELECT min(v.created_at) AS first_at
         FROM output_versions v
         JOIN actions a ON a.id = v.action_id AND a.workspace_id = v.workspace_id
         JOIN workspaces w ON w.id = v.workspace_id
         WHERE a.location_id IS NOT NULL AND ${ELIGIBLE}
         GROUP BY a.location_id) f
       WHERE f.first_at >= $1 AND f.first_at < $2) AS first_draft,
      (SELECT count(*)::int FROM (
         SELECT min(d.created_at) AS first_at
         ${DELIVERY_JOIN}
         WHERE d.counted AND a.location_id IS NOT NULL AND ${ELIGIBLE}
         GROUP BY a.location_id) f
       WHERE f.first_at >= $1 AND f.first_at < $2) AS first_export,
      (SELECT count(DISTINCT a.location_id)::int
         ${DELIVERY_JOIN}
         WHERE d.counted AND d.created_at >= $1 AND d.created_at < $2
           AND a.location_id IS NOT NULL AND ${ELIGIBLE}
           AND EXISTS (
             SELECT 1 FROM deliveries d2
             JOIN output_versions v2 ON v2.id = d2.version_id AND v2.workspace_id = d2.workspace_id
             JOIN actions a2 ON a2.id = v2.action_id AND a2.workspace_id = v2.workspace_id
             WHERE d2.counted AND a2.location_id = a.location_id AND d2.created_at < $1)) AS repeat_export`, window);

  const tasks = await row(client, `
    SELECT
      (SELECT count(*)::int FROM action_runs r JOIN workspaces w ON w.id = r.workspace_id
        WHERE r.created_at >= $1 AND r.created_at < $2 AND ${ELIGIBLE}) AS runs,
      (SELECT count(*)::int FROM action_runs r JOIN workspaces w ON w.id = r.workspace_id
        WHERE r.state IN ('failed','timed_out') AND r.created_at >= $1 AND r.created_at < $2 AND ${ELIGIBLE}) AS failed,
      (SELECT count(*)::int FROM actions a JOIN workspaces w ON w.id = a.workspace_id
        WHERE a.action_state = 'needs_input' AND ${ELIGIBLE}) AS missing_input`, window);

  // Keyed by job creation week so both sides describe the same cohort, and
  // counted by DISTINCT job so a duplicate event cannot hide a missing one.
  const reconciliation = await row(client, `
    SELECT
      (SELECT count(*)::int FROM audit_jobs WHERE created_at >= $1 AND created_at < $2) AS jobs_started,
      (SELECT count(DISTINCT e.job_id)::int FROM scan_events e JOIN audit_jobs j ON j.id = e.job_id
        WHERE e.event_name = 'scan_started' AND j.created_at >= $1 AND j.created_at < $2) AS started_events,
      (SELECT count(*)::int FROM audit_jobs
        WHERE created_at >= $1 AND created_at < $2 AND status IN ('done','partial','failed')) AS jobs_terminal,
      (SELECT count(DISTINCT e.job_id)::int FROM scan_events e JOIN audit_jobs j ON j.id = e.job_id
        WHERE e.event_name = 'scan_completed' AND j.created_at >= $1 AND j.created_at < $2) AS completed_events`, window);

  return {
    week: { label: week.label, start: window[0]!, end: window[1]!, timezone: REPORT_TIMEZONE },
    exclusions: { demoWorkspaces: exclusions.demo ?? 0, internalWorkspaces: exclusions.internal ?? 0 },
    primary: {
      locations: primary.locations ?? 0,
      eligibleLocations: eligible.locations ?? 0,
      workspaces: primary.workspaces ?? 0,
      eligibleWorkspaces: eligible.workspaces ?? 0,
      deliveriesWithoutLocation: primary.without_location ?? 0,
    },
    scans: {
      started: scans.started ?? 0,
      completedFull: scans.full ?? 0,
      completedPartial: scans.partial ?? 0,
      failed: scans.failed ?? 0,
      inProgress: scans.in_progress ?? 0,
    },
    signIns: { first: signIns.first ?? 0 },
    claims: { supported: claims.supported ?? 0, assisted: claims.assisted ?? 0 },
    deliveryFunnel: {
      firstDraft: funnel.first_draft ?? 0,
      firstApprovedExport: funnel.first_export ?? 0,
      repeatWeeklyExport: funnel.repeat_export ?? 0,
    },
    tasks: { runs: tasks.runs ?? 0, failed: tasks.failed ?? 0, missingInputNow: tasks.missing_input ?? 0 },
    paidConversion: { measurable: false, reason: "billing unavailable (DEC-09)" },
    reconciliation: {
      jobsStarted: reconciliation.jobs_started ?? 0,
      startedEvents: reconciliation.started_events ?? 0,
      jobsTerminal: reconciliation.jobs_terminal ?? 0,
      completedEvents: reconciliation.completed_events ?? 0,
    },
    limitations: LIMITATIONS,
  };
}
