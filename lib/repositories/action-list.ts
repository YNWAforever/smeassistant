import "server-only";
import type { Pool } from "pg";
import { getPool } from "@/lib/db/client";
import type { ActionRow, ActionOverviewContext } from "@/lib/workspace/overview";
import type { DisplayPhaseKey } from "@/lib/workspace/overview";
import type { ActionListResult, ActionFilters } from "@/lib/workspace/queries-pages";
import type { ActionListKey } from "@/lib/workspace/action-list-cursor";
import { actionPageSize } from "@/lib/workspace/action-list-cursor";
import type { ActionState } from "@/lib/domain";
import type { ListFilterScope } from "@/lib/workspace/action-list-filters";

export interface ActionListScope extends Partial<ListFilterScope> {
  workspaceId: string;
  locationId: string | null;
  allowedLocationIds: string[] | null;
  channelTemplates: string[] | null;
  status: ActionState | null;
}
export interface ActionListProjection extends ActionRow {
  run_state: ActionRowRunState;
  version: ActionOverviewContext["latestVersion"];
  applied_on: string | null;
  verified_on: string | null;
  phase: DisplayPhaseKey;
}
type ActionRowRunState = NonNullable<ActionOverviewContext["latestRun"]>["state"] | null;

// No version body/meta, run input/output/error or application notes are selected.
const SCOPED = `WITH scoped AS (
  SELECT a.*, r.state AS run_state,
    CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('id',v.id,'version_no',v.version_no,'approval_state',v.approval_state,'delivery_state',v.delivery_state,'first_exported_at',v.first_exported_at) END AS version,
    v.approval_state, v.delivery_state, v.first_exported_at,
    app.applied_on::text, app.verified_on::text
  FROM actions a
  LEFT JOIN LATERAL (SELECT state FROM action_runs WHERE workspace_id=a.workspace_id AND action_id=a.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true
  LEFT JOIN LATERAL (SELECT id,version_no,approval_state,delivery_state,first_exported_at FROM output_versions WHERE workspace_id=a.workspace_id AND action_id=a.id ORDER BY version_no DESC,id DESC LIMIT 1) v ON true
  LEFT JOIN LATERAL (SELECT max(asserted_at) FILTER (WHERE source='owner_asserted') AS applied_on, max(asserted_at) FILTER (WHERE source='verified') AS verified_on FROM action_applications WHERE workspace_id=a.workspace_id AND action_id=a.id AND retracted_at IS NULL) app ON true
  WHERE a.workspace_id=$1 AND ($2::uuid IS NULL OR a.location_id=$2 OR a.location_id IS NULL)
    AND ($3::uuid[] IS NULL OR a.location_id IS NULL OR a.location_id=ANY($3))
    AND ($4::text[] IS NULL OR a.template_key=ANY($4)) AND ($5::text IS NULL OR a.action_state=$5)
    AND ($6::text IS NULL OR strpos(lower(concat_ws(' ',a.title->>'en',a.title->>'zh-HK',a.title->>'zh-TW',a.summary->>'en',a.summary->>'zh-HK',a.summary->>'zh-TW')),lower($6))>0)
    AND ($7::text IS NULL OR ($7='unassigned' AND a.assignee_user_id IS NULL) OR a.assignee_user_id::text=$7)
    AND ($8::text IS NULL OR ($8='none' AND a.due_at IS NULL) OR ($8='overdue' AND a.due_at<$13::timestamptz)
      OR ($8='today' AND a.due_at>=($10::date::timestamp AT TIME ZONE $9) AND a.due_at<($11::date::timestamp AT TIME ZONE $9))
      OR ($8='next_7_days' AND a.due_at>=($10::date::timestamp AT TIME ZONE $9) AND a.due_at<($12::date::timestamp AT TIME ZONE $9)))
), phased AS (
  SELECT scoped.*, CASE
    WHEN capability='Requires connection' THEN 'requires_connection'
    WHEN action_state='needs_input' THEN 'needs_input'
    WHEN run_state IN ('queued','running') THEN 'generating'
    WHEN approval_state='draft' THEN 'draft_ready'
    WHEN approval_state='changes_requested' THEN 'changes_requested'
    WHEN approval_state='approved' AND (delivery_state='export_ready' OR (delivery_state='cancelled' AND first_exported_at IS NULL)) THEN 'approved_export_ready'
    WHEN verified_on IS NOT NULL AND measurement_state<>'measured' THEN 'verified'
    WHEN applied_on IS NOT NULL AND measurement_state<>'measured' THEN 'applied'
    WHEN delivery_state='publishing' THEN 'publishing_to_google'
    WHEN delivery_state='published' THEN 'published_on_google'
    WHEN delivery_state='exported' OR (delivery_state='cancelled' AND first_exported_at IS NOT NULL) THEN 'exported'
    WHEN measurement_state='awaiting_comparable_scan' THEN 'awaiting_comparable_scan'
    WHEN measurement_state='measured' THEN 'measured'
    ELSE 'recommended' END AS phase
  FROM scoped
)`;
const OPEN = "action_state NOT IN ('completed','dismissed','cancelled','expired')";
const COLUMNS = `id,workspace_id,location_id,template_key,source,source_finding_keys,source_snapshot_id,title,summary,evidence,priority,COALESCE(priority_score,0) AS priority_score,priority_factors,effort_minutes,required_inputs,provided_inputs,assignee_user_id,due_at::text,action_state,measurement_state,capability,offer_id,created_at::text,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,run_state,version,applied_on,verified_on,phase`;
const scopeValues = (s: ActionListScope) => [s.workspaceId, s.locationId, s.allowedLocationIds, s.channelTemplates, s.status, s.q ?? null, s.assignee ?? null, s.due ?? null, s.timezone ?? "UTC", s.today ?? "2000-01-01", s.tomorrow ?? "2000-01-02", s.next7 ?? "2000-01-08", s.now ?? "2000-01-01T00:00:00Z"];

export function actionListRepository(client?: Pick<Pool, "query">) {
  const db = () => client ?? getPool();
  return {
    async page(scope: ActionListScope, view: NonNullable<ActionFilters["view"]>, pageSize: number, cursor: ActionListKey | null): Promise<ActionListProjection[]> {
      actionPageSize(pageSize);
      const result = await db().query<ActionListProjection>(`${SCOPED} SELECT ${COLUMNS} FROM phased
        WHERE (($14='completed' AND action_state='completed') OR ($14<>'completed' AND ($5::text IS NOT NULL OR ${OPEN}) AND
          ($14='all' OR ($14='needs_input' AND action_state='needs_input') OR ($14='drafts' AND phase IN ('draft_ready','generating')) OR ($14='awaiting_approval' AND phase IN ('draft_ready','changes_requested')))))
          AND ($15::numeric IS NULL OR (COALESCE(priority_score,0),updated_at,id)<($15::numeric,$16::timestamptz,$17::uuid))
        ORDER BY COALESCE(priority_score,0) DESC,phased.updated_at DESC,id DESC LIMIT $18`, [...scopeValues(scope), view, cursor?.score ?? null, cursor?.updatedAt ?? null, cursor?.id ?? null, pageSize + 1]);
      return result.rows;
    },
    async counts(scope: ActionListScope): Promise<ActionListResult["counts"]> {
      const result = await db().query<ActionListResult["counts"]>(`${SCOPED} SELECT
        count(*) FILTER (WHERE ${OPEN})::int AS "all",
        count(*) FILTER (WHERE ${OPEN} AND action_state='needs_input')::int AS needs_input,
        count(*) FILTER (WHERE ${OPEN} AND phase IN ('draft_ready','generating'))::int AS drafts,
        count(*) FILTER (WHERE ${OPEN} AND phase IN ('draft_ready','changes_requested'))::int AS awaiting_approval,
        count(*) FILTER (WHERE action_state='completed')::int AS completed FROM phased`, scopeValues(scope));
      return result.rows[0];
    },
  };
}
