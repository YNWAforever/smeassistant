/** Historical facade fixture for retained domain tests only; never import from application runtime. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { legacySnapshotRepository } from './legacy-snapshots';
import { completionId } from '@/lib/workspace/completion-id';
import { OPEN_ACTION_STATES } from '@/lib/domain';
import { deriveActions, type DerivedAction, type FindingRow } from '@/lib/workspace/actions';
import { loadDiffForHeadJob, loadSnapshotById, type ScanDiffRow } from '@/lib/workspace/snapshots';
import { WEBSITE_FAQ_TRIGGER, type TemplateKey } from '@/lib/workspace/templates';
function impactOf(finding:FindingRow):number {
 const value=Number(finding.score_impact); return Number.isFinite(value)?value:0;
}

interface OpenActionRow {
  id: string;
  dedupe_key: string;
  source_finding_keys: string[];
  action_state: string;
}

export interface UpsertResult {
  created: number;
  updated: number;
}

export async function upsertOpenActions(
  db: SupabaseClient,
  workspaceId: string,
  derived: DerivedAction[],
  opts: { snapshotId: string; now?: Date },
): Promise<UpsertResult> {
  if (!derived.length) return { created: 0, updated: 0 };
  const now = (opts.now ?? new Date()).toISOString();
  const keys = derived.map((a) => a.dedupeKey);
  const { data: open, error } = await db
    .from("actions")
    .select("id, dedupe_key, source_finding_keys, action_state")
    .eq("workspace_id", workspaceId)
    .in("dedupe_key", keys)
    .in("action_state", OPEN_ACTION_STATES)
    .returns<OpenActionRow[]>();
  if (error) throw new Error("open actions lookup failed");
  const byKey = new Map((open ?? []).map((row) => [row.dedupe_key, row]));

  let created = 0;
  let updated = 0;
  for (const action of derived) {
    const existing = byKey.get(action.dedupeKey);
    const common = {
      source_finding_keys: action.sourceFindingKeys,
      source_snapshot_id: opts.snapshotId,
      title: action.title,
      summary: action.summary,
      evidence: action.evidence,
      priority: action.priority,
      priority_score: action.priorityScore,
      priority_factors: action.priorityFactors,
      effort_minutes: action.effortMinutes,
      required_inputs: action.requiredInputs,
      capability: action.capability,
      updated_at: now,
    };
    if (existing) {
      const { error: updateError } = await db.from("actions").update(common).eq("id", existing.id);
      if (updateError) throw new Error("action update failed");
      updated += 1;
    } else {
      const { error: insertError } = await db.from("actions").insert({
        workspace_id: workspaceId,
        location_id: action.locationId,
        template_key: action.templateKey,
        source: action.source,
        action_state: action.requiredInputs.length ? "needs_input" : "recommended",
        measurement_state: "not_eligible",
        dedupe_key: action.dedupeKey,
        ...common,
      });
      if (insertError) throw new Error("action insert failed");
      created += 1;
    }
  }
  return { created, updated };
}

export interface CloseResult {
  completed: number;
  expired: number;
}

/**
 * Close open actions whose findings are gone. Resolved in a comparable diff →
 * completed and measured; absent from the new snapshot for any other reason →
 * expired (nothing proves the owner fixed it).
 */
export async function closeResolvedActions(
  db: SupabaseClient,
  workspaceId: string,
  locationId: string | null,
  diff: ScanDiffRow | null,
  currentFindingKeys: Set<string>,
  opts: { now?: Date } = {},
): Promise<CloseResult> {
  const now = (opts.now ?? new Date()).toISOString();
  let query = db
    .from("actions")
    .select("id, dedupe_key, source_finding_keys, action_state")
    .eq("workspace_id", workspaceId)
    .eq("source", "finding")
    .in("action_state", OPEN_ACTION_STATES);
  query = locationId ? query.eq("location_id", locationId) : query.is("location_id", null);
  const { data: open, error } = await query.returns<OpenActionRow[]>();
  if (error) throw new Error("open actions lookup failed");

  const resolved = new Set(diff?.comparable ? diff.resolved_findings : []);
  let completed = 0;
  let expired = 0;
  for (const row of open ?? []) {
    const keys = row.source_finding_keys.filter((k) => k !== WEBSITE_FAQ_TRIGGER);
    if (!keys.length || keys.some((k) => currentFindingKeys.has(k))) continue;
    const allResolved = keys.every((k) => resolved.has(k));
    const patch = allResolved
      ? { action_state: "completed", measurement_state: "measured", completed_at: now, updated_at: now }
      : { action_state: "expired", updated_at: now };
    const { error: updateError } = await db.from("actions").update(patch).eq("id", row.id);
    if (updateError) throw new Error("action close failed");
    if (allResolved) completed += 1;
    else expired += 1;
  }
  return { completed, expired };
}

/** Full pipeline for one snapshot: derive → upsert → close, with one audit event. */
export async function deriveLegacyActionsForSnapshot(db: SupabaseClient, snapshotId: string, opts: { now?: Date } = {}): Promise<UpsertResult & CloseResult> {
  const snapshot = await loadSnapshotById(legacySnapshotRepository(db), snapshotId);
  if (!snapshot) throw new Error("snapshot_not_found");
  if (!snapshot.workspaceId) throw new Error("snapshot_requires_workspace");
  const workspaceId = snapshot.workspaceId;

  // Sequential recovery must not replace newer evidence/close newer actions.
  // This read is not a transaction fence: concurrent stale-worker recovery must
  // remain disabled until writes and lease validation share a DB transaction.
  let latestQuery = db.from("scan_snapshots").select("id").eq("workspace_id", workspaceId);
  latestQuery = snapshot.locationId ? latestQuery.eq("location_id", snapshot.locationId) : latestQuery.is("location_id", null);
  const { data: latest, error: latestError } = await latestQuery.order("observed_at", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (latestError || !latest) throw new Error("latest snapshot lookup failed");
  if (latest.id !== snapshot.id) return { created: 0, updated: 0, completed: 0, expired: 0 };

  const [findingsResult, diff, brandResult, googleResult, workspaceResult, draftsResult] = await Promise.all([
    db
      .from("audit_findings")
      .select("finding_key, module, severity, score_impact, owner_message_zh, owner_message_en, owner_action_zh, owner_action_en, evidence")
      .eq("job_id", snapshot.jobId)
      .returns<FindingRow[]>(),
    loadDiffForHeadJob(legacySnapshotRepository(db), snapshot.jobId),
    db.from("brand_profiles").select("workspace_id").eq("workspace_id", workspaceId).maybeSingle(),
    db
      .from("oauth_connections")
      .select("status, connected_at")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_gbp")
      .order("connected_at", { ascending: false })
      .limit(1)
      .returns<Array<{ status: string }>>(),
    db.from("workspaces").select("industry").eq("id", workspaceId).maybeSingle<{ industry: string | null }>(),
    db
      .from("output_versions")
      .select("action_id, approval_state, actions!inner(template_key, workspace_id)")
      .eq("actions.workspace_id", workspaceId)
      .eq("approval_state", "draft")
      .returns<Array<{ action_id: string; actions: { template_key: string } | { template_key: string }[] }>>(),
  ]);
  if (findingsResult.error) throw new Error("findings lookup failed");

  const existingDrafts = new Set<TemplateKey>();
  for (const row of draftsResult.data ?? []) {
    const rel = Array.isArray(row.actions) ? row.actions[0] : row.actions;
    if (rel?.template_key) existingDrafts.add(rel.template_key as TemplateKey);
  }

  const findings = findingsResult.data ?? [];
  const derived = deriveActions({
    snapshot,
    findings,
    latestDiff: diff,
    brandProfileExists: Boolean(brandResult.data),
    googleConnection: googleResult.data?.[0] ?? null,
    industry: workspaceResult.data?.industry ?? null,
    existingDrafts,
    now: opts.now,
  });

  const upserted = await upsertOpenActions(db, workspaceId, derived, { snapshotId, now: opts.now });
  const closed = await closeResolvedActions(
    db,
    workspaceId,
    snapshot.locationId,
    diff,
    new Set(findings.filter((f) => impactOf(f) < 0).map((f) => f.finding_key)),
    { now: opts.now },
  );

  const { data: priorAudit, error: auditLookupError } = await db.from("audit_events").select("id").eq("event", "action.derived").eq("entity_id", snapshotId).limit(1);
  if (auditLookupError) throw new Error("action audit lookup failed");
  if (!priorAudit?.length) {
    const { error: auditError } = await db.from("audit_events").upsert({
      idempotency_key: completionId("action.derived", snapshotId),
      workspace_id: workspaceId,
      location_id: snapshot.locationId,
      actor_type: "system",
      actor_id: null,
      event: "action.derived",
      entity_type: "scan_snapshot",
      entity_id: snapshotId,
      payload: { locale: null, ...upserted, ...closed },
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (auditError) throw new Error("action audit insert failed");
  }

  return { ...upserted, ...closed };
}
