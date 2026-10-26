import "server-only";
import type { Pool, QueryResultRow } from "pg";
import type { MonthWindow } from "../workspace/month-window";
import { getPool } from "../db/client";
import type { WorkspaceRow, LocationRow, UsageRow, SnapshotRow, LocationCardRow } from "../workspace/queries";

import type { ActionState } from "../domain";
import type { ActionRow } from "../workspace/overview";
import { parseVersionMeta } from "../workspace/version-meta";
import type { ScanSnapshotRow, ScanDiffRow } from "../workspace/snapshots";
import type { AeoSnapshotRow } from "../trends/aeo-trend-model";
import { COPY_FOLLOW_UP_EVENT, type HomeCopyFollowUp } from "../workspace/copy-follow-up";
import type { HomeReviewCandidate } from "../workspace/home-review-follow-up";
import { OWNER_REVIEW_CHECK_EVENT } from "../workspace/owner-review-check";
import type { RunRow, VersionRow, MeasurementRow, AuditEventRow, NotificationRow, IntegrationsModel, DeliveredWorkRow } from "../workspace/queries-pages";

export const SNAPSHOT_COLUMNS = "id, job_id, workspace_id, location_id, market, observed_at::text, scoring_version, overall_score, coverage, module_states, metrics, website_checks, comparable_to, diff_id, created_at::text";
export const DIFF_COLUMNS = "id, base_job_id, head_job_id, comparable, incomparable_reason, composite_withheld_reason, intersection_modules, composite_base, composite_head, composite_delta, resolved_findings, regressed_findings, decayed_findings, lost_coverage, gained_coverage, created_at::text";
const ACTION_COLUMNS = "id, source_snapshot_id, workspace_id, location_id, template_key, source, source_finding_keys, title, summary, evidence, priority, priority_score, priority_factors, effort_minutes, required_inputs, provided_inputs, assignee_user_id, due_at::text, action_state, measurement_state, capability, offer_id, created_at::text, updated_at::text";

function pageLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid_page_limit");
  return value;
}

const WORKSPACE_COLUMNS = "id, slug, business_name, market, tier, timezone, is_demo, instagram_handle, industry, district";
const LOCATION_COLUMNS = "id, workspace_id, slug, name, address, district, is_primary, place_id";

export interface ActionVerificationScope {
  actionId: string;
  locationId: string | null;
}

/** Selected workspace rows, called only after membership authorization. */
export function workspaceReadRepository(client?: Pick<Pool, "query">) {
  async function rows<T extends QueryResultRow>(sql: string, values: unknown[]): Promise<T[]> {
    try {
      return (await (client ?? getPool()).query<T>(sql, values)).rows;
    } catch (error) {
      // F-16: keep the SQLSTATE (never the message or SQL) so the caller's log
      // can tell a missing column (42703) from a privilege or timeout failure.
      const code = (error as { code?: unknown } | null)?.code;
      throw Object.assign(new Error("workspace_read_unavailable"), typeof code === "string" ? { code } : {});
    }
  }
  return {
    async workspaces(ids: string[]): Promise<WorkspaceRow[]> {
      if (!ids.length) return [];
      return rows<WorkspaceRow>(`SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE id = ANY($1::uuid[])`, [ids]);
    },
    async locations(workspaceIds: string[]): Promise<LocationRow[]> {
      if (!workspaceIds.length) return [];
      return rows<LocationRow>(`SELECT ${LOCATION_COLUMNS} FROM locations WHERE workspace_id = ANY($1::uuid[]) ORDER BY is_primary DESC, name ASC`, [workspaceIds]);
    },
    /** Selector summaries in one statement, independent of membership/location count. */
    async locationCards(workspaceIds: string[]): Promise<LocationCardRow[]> {
      if (!workspaceIds.length) return [];
      // Reduce each source BEFORE joining: snapshot history must not multiply
      // action counts. Both keys bind evidence/actions to the location's tenant.
      // Set-based reads avoid repeated history scans on the current schema.
      return rows<LocationCardRow>(`WITH latest AS (
          SELECT DISTINCT ON (workspace_id, location_id)
            workspace_id, location_id, overall_score, coverage, observed_at
          FROM scan_snapshots
          WHERE workspace_id=ANY($1::uuid[]) AND location_id IS NOT NULL
          ORDER BY workspace_id, location_id, observed_at DESC, created_at DESC, id DESC
        ), waiting AS (
          SELECT workspace_id, location_id, count(*)::int AS count, count(*) FILTER (WHERE priority='urgent')::int AS urgent_count
          FROM actions
          WHERE workspace_id=ANY($1::uuid[])
            AND action_state NOT IN ('completed','dismissed','cancelled','expired')
          GROUP BY workspace_id, location_id
        )
        SELECT l.id, l.workspace_id, l.slug, l.name, l.address, l.district, l.is_primary, l.place_id,
          s.overall_score, s.coverage, s.observed_at::text,
          coalesce(u.urgent_count,0)::int AS urgent_actions,
          (coalesce(u.count,0)+coalesce(w.count,0))::int AS waiting_actions
        FROM locations l
        LEFT JOIN latest s ON s.workspace_id=l.workspace_id AND s.location_id=l.id
        LEFT JOIN waiting u ON u.workspace_id=l.workspace_id AND u.location_id=l.id
        LEFT JOIN waiting w ON w.workspace_id=l.workspace_id AND w.location_id IS NULL
        WHERE l.workspace_id=ANY($1::uuid[])
        ORDER BY l.is_primary DESC, l.name ASC`, [workspaceIds]);
    },
    async usage(workspaceId: string, period: string, allowance: number | null): Promise<UsageRow> {
      // Insert and re-read in separate statements: a concurrent conflict winner is
      // visible to the second READ COMMITTED snapshot without changing its allowance.
      await rows("INSERT INTO workspace_usage(workspace_id, period, allowance) VALUES($1,$2,$3) ON CONFLICT (workspace_id,period) DO NOTHING", [workspaceId, period, allowance]);
      const [row] = await rows<UsageRow>("SELECT period, approved_deliveries, allowance FROM workspace_usage WHERE workspace_id=$1 AND period=$2", [workspaceId, period]);
      if (!row) throw new Error("workspace_read_unavailable");
      return row;
    },
    async unreadNotifications(workspaceId: string, userId: string): Promise<number> {
      const [row] = await rows<{ count: number }>("SELECT count(*)::int AS count FROM workspace_notifications WHERE workspace_id=$1 AND user_id=$2 AND read_at IS NULL", [workspaceId, userId]);
      return row.count;
    },
    async urgentActions(workspaceId: string, locationId?: string): Promise<number> {
      const [row] = await rows<{ count: number }>("SELECT count(*)::int AS count FROM actions WHERE workspace_id=$1 AND priority='urgent' AND action_state NOT IN ('completed','dismissed','cancelled','expired') AND ($2::uuid IS NULL OR location_id=$2)", [workspaceId, locationId ?? null]);
      return row.count;
    },
    async latestSnapshot(workspaceId: string, locationId: string): Promise<SnapshotRow | null> {
      const [row] = await rows<SnapshotRow>("SELECT overall_score, coverage, observed_at::text FROM scan_snapshots WHERE workspace_id=$1 AND location_id=$2 ORDER BY observed_at DESC LIMIT 1", [workspaceId, locationId]);
      return row ?? null;
    },
    async latestReport(workspaceId: string): Promise<{ share_slug: string | null; created_at: string; status: string | null } | null> {
      const [row] = await rows<{ share_slug: string | null; created_at: string; status: string | null }>("SELECT share_slug, created_at::text, status FROM audit_jobs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1", [workspaceId]);
      return row ?? null;
    },
    async snapshots(workspaceId: string, locationId: string, limit: number): Promise<ScanSnapshotRow[]> {
      return rows<ScanSnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM scan_snapshots WHERE workspace_id=$1 AND location_id=$2 ORDER BY observed_at DESC LIMIT $3`, [workspaceId, locationId, pageLimit(limit)]);
    },
    async diff(id: string, workspaceId: string, headJobId: string): Promise<ScanDiffRow | null> {
      const [row] = await rows<ScanDiffRow>(`SELECT ${DIFF_COLUMNS} FROM scan_diffs
        WHERE id=$1 AND head_job_id=$3
          AND EXISTS (SELECT 1 FROM audit_jobs base WHERE base.id=scan_diffs.base_job_id AND base.workspace_id=$2)
          AND EXISTS (SELECT 1 FROM audit_jobs head WHERE head.id=scan_diffs.head_job_id AND head.workspace_id=$2)`, [id, workspaceId, headJobId]);
      return row ?? null;
    },
    async actions(workspaceId: string, opts: { locationId?: string | null; states?: ActionState[]; ids?: string[] } = {}): Promise<Array<ActionRow & { source_snapshot_id: string | null }>> {
      return rows<ActionRow & { source_snapshot_id: string | null }>(`SELECT ${ACTION_COLUMNS} FROM actions
        WHERE workspace_id=$1
          AND ($2::uuid IS NULL OR location_id=$2 OR location_id IS NULL)
          AND ($3::text[] IS NULL OR action_state=ANY($3))
          AND ($4::uuid[] IS NULL OR id=ANY($4))
        ORDER BY priority_score DESC, updated_at DESC`, [workspaceId, opts.locationId || null, opts.states ?? null, opts.ids ?? null]);
    },
    async runs(workspaceId: string, actionIds: string[]): Promise<RunRow[]> {
      if (!actionIds.length) return [];
      return rows<RunRow>(`SELECT r.id, r.action_id, r.agent_key, r.state, r.error, r.created_at::text, r.finished_at::text,
        coalesce(r.state NOT IN ('queued','running') AND r.input #>> '{provider_usage,status}' IN ('pending','unknown','partial'),false) AS usage_pending
        FROM action_runs r JOIN actions a ON a.id=r.action_id AND a.workspace_id=r.workspace_id
        WHERE a.workspace_id=$1 AND r.action_id=ANY($2::uuid[]) ORDER BY r.created_at DESC`, [workspaceId, actionIds]);
    },
    // P2.1 item 7. `counted=true` only: exactly the deliveries guardrail 7
    // treats as real (the first export/publish of an approved version), so a
    // repeat copy of the same version never appears twice.
    async deliveries(workspaceId: string, locationId: string | null, limit: number): Promise<DeliveredWorkRow[]> {
      return rows<DeliveredWorkRow>(`SELECT a.id AS action_id, a.template_key, a.title, v.version_no, d.mode, d.channel, d.created_at::text AS delivered_at
        FROM deliveries d
        JOIN output_versions v ON v.id=d.version_id AND v.workspace_id=d.workspace_id
        JOIN actions a ON a.id=v.action_id AND a.workspace_id=v.workspace_id
        WHERE d.workspace_id=$1 AND d.counted=true AND ($2::uuid IS NULL OR a.location_id=$2)
        ORDER BY d.created_at DESC LIMIT $3`, [workspaceId, locationId, pageLimit(limit)]);
    },
    // `meta` carries the guardrail warnings the agents already compute and
    // artifacts.ts already persists. It was never selected, so the approval
    // panel showed a constant "1 reminder" on every draft and a real violation
    // looked exactly like a clean one. Parsed here rather than shipped raw:
    // the blob is unconstrained jsonb and has no business reaching the client.
    // `first_exported_at` (0002) says whether the version was ever exported
    // now that delivery_state can also read publishing/published/cancelled
    // (P4.6). Deliberately not `first_published_at`: that is a 0014 column,
    // and this query runs on every action page with the publish flag off.
    async versions(workspaceId: string, actionIds: string[]): Promise<VersionRow[]> {
      if (!actionIds.length) return [];
      const raw = await rows<Omit<VersionRow, "origin" | "agentKey" | "checked" | "guardrails" | "agentNotes" | "acceptanceCriteria" | "offerRevision"> & { meta: unknown }>(
        `SELECT v.id, v.action_id, v.version_no, v.body, v.alt_text, v.author_type,
        v.author_user_id, v.approval_state, v.delivery_state, v.approved_at::text, v.reviewer_comment, v.created_at::text,
        v.first_exported_at::text, v.meta
        FROM output_versions v JOIN actions a ON a.id=v.action_id AND a.workspace_id=v.workspace_id
        WHERE a.workspace_id=$1 AND v.action_id=ANY($2::uuid[]) ORDER BY v.version_no DESC`, [workspaceId, actionIds]);
      return raw.map(({ meta, ...version }) => ({ ...version, ...parseVersionMeta(meta, version.author_type) }));
    },
    async latestConnection(workspaceId: string): Promise<{ status: IntegrationsModel["google"]["status"]; expires_at: string | null; updated_at: string | null; created_at: string } | null> {
      const [row] = await rows<{ status: IntegrationsModel["google"]["status"]; expires_at: string | null; updated_at: string | null; created_at: string }>(
        // An active row wins over a merely newer one. The Integrations page
        // shows this status, and the Disconnect control keys on it, so ordering
        // by recency alone could hide the control while a live credential
        // existed. `oauth_connections_active_provider_key` guarantees at most
        // one active row per provider, so the tie-break is unambiguous.
        "SELECT status, expires_at::text, updated_at::text, connected_at::text AS created_at FROM oauth_connections WHERE workspace_id=$1 AND provider='google_gbp' ORDER BY (status='active') DESC, connected_at DESC LIMIT 1", [workspaceId]);
      return row ?? null;
    },
    // Scoped on the AFTER SNAPSHOT's location rather than the action's:
    // measurements are written for workspace-wide actions too (their
    // location_id is NULL), so keying on a.location_id would drop them from
    // every location view. LEFT JOIN because after_snapshot_id is
    // `on delete set null`, and a measurement whose snapshot has gone must not
    // vanish from the workspace-wide view.
    async measurements(workspaceId: string, actionId?: string, limit?: number, locationId?: string | null): Promise<MeasurementRow[]> {
      return rows<MeasurementRow>(`SELECT m.id, m.action_id, m.metric_key, m.before_value, m.after_value,
        m.delta, m.fact_type, m.attribution_basis, m.window_days, m.created_at::text, s.location_id
        FROM action_measurements m JOIN actions a ON a.id=m.action_id AND a.workspace_id=m.workspace_id
        LEFT JOIN scan_snapshots s ON s.id=m.after_snapshot_id
        WHERE m.workspace_id=$1 AND ($2::uuid IS NULL OR m.action_id=$2)
          AND ($4::uuid IS NULL OR s.location_id=$4 OR s.location_id IS NULL)
        ORDER BY m.created_at DESC LIMIT $3`, [workspaceId, actionId ?? null, limit === undefined ? null : pageLimit(limit), locationId ?? null]);
    },
    // `location_id IS NULL` means "all locations" (CLAUDE.md 3.3), so a
    // workspace-wide action must stay counted in a location-scoped total --
    // exactly as actions() does above. Dropping that arm would make Home's
    // counters SMALLER than the same location's Actions tab.
    // Getting-started checklist (Phase 5): has any version in this workspace
    // been approved? approved_at stays set when a later edit supersedes it; a
    // later decision can clear it, so an exported version also counts.
    async anyApprovedVersion(workspaceId: string): Promise<boolean> {
      const [row] = await rows<{ approved: boolean }>("SELECT EXISTS(SELECT 1 FROM output_versions WHERE workspace_id=$1 AND (approved_at IS NOT NULL OR first_exported_at IS NOT NULL)) AS approved", [workspaceId]);
      return row?.approved === true;
    },
    async draftVersions(workspaceId: string, locationId?: string | null): Promise<Array<{ id: string }>> {
      return rows<{ id: string }>("SELECT v.id FROM output_versions v JOIN actions a ON a.id=v.action_id AND a.workspace_id=v.workspace_id WHERE a.workspace_id=$1 AND v.approval_state='draft' AND ($2::uuid IS NULL OR a.location_id=$2 OR a.location_id IS NULL)", [workspaceId, locationId ?? null]);
    },
    async homeCopyFollowUp(workspaceId: string, locationId: string | null, allowedLocationIds: string[] | null): Promise<Omit<HomeCopyFollowUp, "canRecord"> | null> {
      const result = await rows<Omit<HomeCopyFollowUp, "canRecord">>(`SELECT e.id::text,a.workspace_id AS "workspaceId",a.id AS "actionId",a.location_id AS "locationId",
        v.id AS "versionId",v.version_no AS "versionNo",a.title
        FROM actions a JOIN output_versions v ON v.workspace_id=a.workspace_id AND v.action_id=a.id
        JOIN LATERAL (SELECT id,payload,created_at FROM audit_events WHERE workspace_id=a.workspace_id
          AND entity_type='action' AND entity_id=a.id AND event=$4 AND location_id IS NOT DISTINCT FROM a.location_id
          AND payload->>'versionId'=v.id::text ORDER BY created_at DESC,id DESC LIMIT 1) e ON true
        WHERE a.workspace_id=$1 AND v.approval_state='approved' AND (e.payload->>'decision'='pending' OR e.payload->>'decision'='later' AND e.created_at<=now()-interval '24 hours')
        AND a.action_state NOT IN ('dismissed','cancelled','expired')
        AND ($2::uuid IS NULL OR a.location_id=$2 OR a.location_id IS NULL)
        AND ($3::uuid[] IS NULL OR a.location_id IS NULL OR a.location_id=ANY($3::uuid[]))
        AND EXISTS(SELECT 1 FROM deliveries d WHERE d.workspace_id=a.workspace_id AND d.version_id=v.id AND d.mode='copy' AND d.state='exported')
        AND NOT EXISTS(SELECT 1 FROM action_applications p WHERE p.workspace_id=a.workspace_id AND p.action_id=a.id AND p.output_version_id=v.id)
        ORDER BY e.created_at DESC,e.id DESC LIMIT 1`, [workspaceId, locationId, allowedLocationIds, COPY_FOLLOW_UP_EVENT]);
      return result[0] ?? null;
    },
    async homeReviewCandidates(workspaceId: string, locationId: string | null, allowedLocationIds: string[] | null): Promise<HomeReviewCandidate[]> {
      return rows<HomeReviewCandidate>(`SELECT a.workspace_id,a.id AS action_id,a.location_id,a.title,a.action_state,
        v.id AS version_id,v.version_no,v.approval_state,v.delivery_state,p.asserted_at::text AS applied_at,
        latest.id AS latest_version_id,latest.version_no AS latest_version_no,latest.approval_state AS latest_approval_state,
        CASE WHEN checked.id IS NULL THEN NULL ELSE to_jsonb(checked) END AS owner_check
        FROM actions a
        JOIN action_applications p ON p.workspace_id=a.workspace_id AND p.action_id=a.id
        JOIN output_versions v ON v.workspace_id=a.workspace_id AND v.action_id=a.id AND v.id=p.output_version_id
        JOIN LATERAL (SELECT id,version_no,approval_state FROM output_versions
          WHERE workspace_id=a.workspace_id AND action_id=a.id ORDER BY version_no DESC LIMIT 1) latest ON true
        LEFT JOIN LATERAL (SELECT e.id::text AS id,e.workspace_id,e.location_id,e.actor_type,e.actor_id,
          e.event,e.entity_type,e.entity_id,e.payload,
          to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
          FROM audit_events e WHERE e.workspace_id=a.workspace_id AND e.entity_type='action' AND e.entity_id=a.id
          AND e.location_id IS NOT DISTINCT FROM a.location_id AND e.event=$4
          AND e.payload#>>'{owner_check,versionId}'=v.id::text ORDER BY e.created_at DESC,e.id DESC LIMIT 1) checked ON true
        WHERE a.workspace_id=$1 AND a.template_key='review-response' AND a.action_state='completed'
        AND p.source='owner_asserted' AND p.retracted_at IS NULL
        AND ($2::uuid IS NULL OR a.location_id=$2 OR a.location_id IS NULL)
        AND ($3::uuid[] IS NULL OR a.location_id IS NULL OR a.location_id=ANY($3::uuid[]))
        AND NOT EXISTS(SELECT 1 FROM action_applications verified WHERE verified.workspace_id=a.workspace_id
          AND verified.action_id=a.id AND verified.output_version_id=v.id AND verified.source='verified' AND verified.retracted_at IS NULL)
        ORDER BY p.asserted_at DESC,v.version_no DESC,a.id LIMIT 3`,
      [workspaceId, locationId, allowedLocationIds, OWNER_REVIEW_CHECK_EVENT]);
    },
    async completedActions(workspaceId: string, window: MonthWindow, locationId?: string | null): Promise<Array<{ id: string; measurement_state: string; completed_at: string | null }>> {
      return rows<{ id: string; measurement_state: string; completed_at: string | null }>(`SELECT id, measurement_state, completed_at::text FROM actions WHERE workspace_id=$1 AND action_state='completed'
        AND completed_at >= ($2::date::timestamp AT TIME ZONE $4)
        AND completed_at < ($3::date::timestamp AT TIME ZONE $4)
        AND ($5::uuid IS NULL OR location_id=$5 OR location_id IS NULL)`, [workspaceId, window.startLocalDate, window.endLocalDate, window.timezone, locationId ?? null]);
    },
    /**
     * `anniversary_day`, not `next_run_at`, is what the workspace can honestly
     * show. A row is INSERTed once (guarded by `scheduleExists`) and never
     * UPDATEd, so `next_run_at` is frozen at the first rescan's anniversary and
     * silently drifts into the past -- rendering it as a date promised a run on
     * a day that had already gone by. The anniversary day recurs and stays true.
     */
    async schedules(workspaceId: string, placeIds: string[]): Promise<Array<{ place_id: string; cadence: string; next_run_at: string | null; anniversary_day: number | null }>> {
      if (!placeIds.length) return [];
      return rows<{ place_id: string; cadence: string; next_run_at: string | null; anniversary_day: number | null }>("SELECT place_id, cadence, next_run_at::text, anniversary_day FROM scan_schedules WHERE workspace_id=$1 AND place_id=ANY($2::text[])", [workspaceId, placeIds]);
    },
    async aeoSnapshots(workspaceId: string, jobIds: string[]): Promise<AeoSnapshotRow[]> {
      if (!jobIds.length) return [];
      return rows<AeoSnapshotRow>(`SELECT s.job_id, s.surface, s.cited, s.captured_at::text
        FROM aeo_surface_snapshots s JOIN audit_jobs j ON j.id=s.job_id
        WHERE j.workspace_id=$1 AND s.job_id=ANY($2::uuid[])`, [workspaceId, jobIds]);
    },
    async activity(workspaceId: string, limit: number, verificationFor?: ActionVerificationScope): Promise<AuditEventRow[]> {
      if (verificationFor) {
        return rows<AuditEventRow>(`SELECT id, workspace_id, location_id, actor_type, actor_id, event, entity_type, entity_id, payload, created_at::text
          FROM audit_events WHERE workspace_id=$1 AND entity_type='action' AND entity_id=$3
           AND event='action.verification_checked' AND location_id IS NOT DISTINCT FROM $4::uuid
          ORDER BY created_at DESC,id DESC LIMIT $2`,
        [workspaceId, pageLimit(limit), verificationFor.actionId, verificationFor.locationId]);
      }
      return rows<AuditEventRow>(`SELECT id, workspace_id, location_id, actor_type, actor_id, event, entity_type, entity_id, payload, created_at::text
        FROM audit_events WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2`, [workspaceId, pageLimit(limit)]);
    },
    async notifications(workspaceId: string, userId: string): Promise<NotificationRow[]> {
      return rows<NotificationRow>(`SELECT id, kind, title, body, href, read_at::text, created_at::text
        FROM workspace_notifications WHERE workspace_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 50`, [workspaceId, userId]);
    },
    async notificationPreferences(workspaceId: string): Promise<{ notify_rescan_complete: boolean | null; notify_regression_alert: boolean | null; notify_monthly_digest: boolean | null } | null> {
      const [row] = await rows<{ notify_rescan_complete: boolean | null; notify_regression_alert: boolean | null; notify_monthly_digest: boolean | null }>("SELECT notify_rescan_complete, notify_regression_alert, notify_monthly_digest FROM workspaces WHERE id=$1", [workspaceId]);
      return row ?? null;
    },
  };
}
