import type { SupabaseClient } from "@supabase/supabase-js";
import { localized, OPEN_ACTION_STATES, type Capability, type FactType, type LocalizedText, type Priority } from "@/lib/domain";
import { scorePriority, type PriorityFactor } from "./priority";
import { loadDiffForHeadJob, loadSnapshotById, type ScanDiffRow, type SnapshotRecord } from "./snapshots";
import { isLedgerOnly, templateByKey, templateForFinding, WEBSITE_FAQ_TRIGGER, type ActionTemplate, type TemplateKey } from "./templates";

/**
 * Action derivation (CLAUDE.md §3.6). Findings with a negative score impact
 * map onto templates; one open action per (workspace, location, template) is
 * kept up to date across snapshots instead of duplicated; resolved findings in
 * a comparable diff close their action as measured, vanished ones expire it.
 */
export interface FindingRow {
  finding_key: string;
  module: string;
  severity: "critical" | "warning" | "info";
  score_impact: number | string;
  owner_message_zh: string | null;
  owner_message_en: string | null;
  owner_action_zh?: string | null;
  owner_action_en?: string | null;
  evidence: Record<string, unknown> | null;
}

export interface ActionEvidence {
  factType: FactType;
  source: string;
  value: string;
  detail: LocalizedText;
  observedAt: string;
  freshness: LocalizedText;
}

export interface DerivedAction {
  templateKey: TemplateKey;
  locationId: string | null;
  source: "finding" | "system";
  sourceFindingKeys: string[];
  title: LocalizedText;
  summary: LocalizedText;
  evidence: ActionEvidence;
  priority: Priority;
  priorityScore: number;
  priorityFactors: PriorityFactor[];
  effortMinutes: number;
  requiredInputs: string[];
  capability: Capability;
  dedupeKey: string;
}

export interface DeriveActionsInput {
  snapshot: SnapshotRecord;
  findings: FindingRow[];
  latestDiff: ScanDiffRow | null;
  brandProfileExists: boolean;
  googleConnection: { status: string } | null;
  industry: string | null;
  /** Templates that already have a draft output version on their open action. */
  existingDrafts: Set<TemplateKey>;
  now?: Date;
}

const MODULE_STATE_OF: Record<string, keyof SnapshotRecord["moduleStates"] | undefined> = {
  ig: "instagram",
  gbp: "google_business",
  aeo: "search_ai",
};

const SOURCE_LABEL: Record<string, string> = {
  ig: "Instagram public evidence",
  gbp: "Google Business Profile",
  aeo: "Search and AI surfaces",
  trust: "Trust signals",
  website: "Website checks",
  system: "Integration health",
};

export function dedupeKeyFor(workspaceId: string, locationId: string | null, templateKey: TemplateKey): string {
  return `${workspaceId}:${locationId ?? "all"}:${templateKey}`;
}

export function freshnessText(observedAt: string, now: Date): LocalizedText {
  const days = Math.max(0, Math.floor((now.getTime() - Date.parse(observedAt)) / 86_400_000));
  if (!Number.isFinite(days) || days === 0) return localized("Updated today", "今日更新", "今天更新");
  return localized(`Updated ${days} days ago`, `${days} 日前更新`, `${days} 天前更新`);
}

function impactOf(finding: FindingRow): number {
  const n = typeof finding.score_impact === "number" ? finding.score_impact : Number(finding.score_impact);
  return Number.isFinite(n) ? n : 0;
}

function evidenceValue(finding: FindingRow): string {
  const evidence = finding.evidence ?? {};
  const preferred = ["value", "current", "count", "rate", "days", "rank", "score"];
  for (const key of preferred) {
    const v = evidence[key];
    if (typeof v === "number" || typeof v === "string") return String(v);
  }
  const first = Object.entries(evidence).find(([, v]) => typeof v === "number" || typeof v === "string");
  return first ? `${first[0]}: ${String(first[1])}` : finding.finding_key;
}

function severityRank(severity: FindingRow["severity"]): number {
  return severity === "critical" ? 3 : severity === "warning" ? 2 : 1;
}

/** Strongest finding first: most negative impact, then severity. */
function strongest(findings: FindingRow[]): FindingRow {
  return [...findings].sort((a, b) => impactOf(a) - impactOf(b) || severityRank(b.severity) - severityRank(a.severity))[0];
}

function buildAction(
  template: ActionTemplate,
  findings: FindingRow[],
  input: DeriveActionsInput,
  now: Date,
  evidenceOverride?: Partial<ActionEvidence>,
): DerivedAction {
  const { snapshot } = input;
  const lead = findings.length ? strongest(findings) : null;
  const stateKey = lead ? MODULE_STATE_OF[lead.module] : undefined;
  const moduleState = stateKey ? snapshot.moduleStates[stateKey] : null;
  const regressed = Boolean(input.latestDiff?.comparable && findings.some((f) => input.latestDiff!.regressed_findings.includes(f.finding_key)));
  const ageDays = Math.floor((now.getTime() - Date.parse(snapshot.observedAt)) / 86_400_000);
  const priority = scorePriority({
    scoreImpact: lead ? impactOf(lead) : -5,
    module: lead?.module ?? "gbp",
    severity: lead?.severity ?? "warning",
    regressed,
    evidenceAgeDays: Number.isFinite(ageDays) ? ageDays : null,
    inputsAvailable: template.requiredInputs.length === 0,
    hasDraft: input.existingDrafts.has(template.key),
    effortMinutes: template.effortMinutes,
    externalFacing: template.externalFacing,
    brandProfileExists: input.brandProfileExists,
    moduleConfidence: moduleState?.confidence ?? "none",
    moduleMeasured: moduleState ? moduleState.status === "measured" : true,
  });
  const detail = lead
    ? localized(lead.owner_message_en ?? lead.owner_message_zh ?? lead.finding_key, lead.owner_message_zh ?? lead.owner_message_en ?? lead.finding_key)
    : template.summary;
  return {
    templateKey: template.key,
    locationId: snapshot.locationId,
    source: template.triggerFindingKeys.length ? "finding" : "system",
    sourceFindingKeys: findings.map((f) => f.finding_key),
    title: template.title,
    summary: template.summary,
    evidence: {
      factType: "Observed",
      source: SOURCE_LABEL[lead?.module ?? "system"] ?? lead?.module ?? "system",
      value: lead ? evidenceValue(lead) : "",
      detail,
      observedAt: snapshot.observedAt,
      freshness: freshnessText(snapshot.observedAt, now),
      ...evidenceOverride,
    },
    priority: priority.priority,
    priorityScore: priority.score,
    priorityFactors: priority.factors,
    effortMinutes: template.effortMinutes,
    requiredInputs: template.requiredInputs,
    capability: template.capability,
    dedupeKey: dedupeKeyFor(snapshot.workspaceId ?? "", snapshot.locationId, template.key),
  };
}

export function deriveActions(input: DeriveActionsInput): DerivedAction[] {
  const now = input.now ?? new Date();
  const grouped = new Map<TemplateKey, FindingRow[]>();
  for (const finding of input.findings) {
    // Only findings that actually cost score create actions; trust's
    // zero-impact "encouragement" tiers and ledger-only keys never do.
    if (impactOf(finding) >= 0 || isLedgerOnly(finding.finding_key)) continue;
    const template = templateForFinding(finding.finding_key);
    if (!template) continue;
    grouped.set(template.key, [...(grouped.get(template.key) ?? []), finding]);
  }

  const faqFailed = input.snapshot.websiteChecks?.results.some((r) => r.key === "faq_schema" && !r.pass) ?? false;
  if (faqFailed && !grouped.has("visibility-content")) grouped.set("visibility-content", []);

  const actions: DerivedAction[] = [];
  for (const [key, findings] of grouped) {
    const template = templateByKey(key);
    const action = buildAction(template, findings, input, now);
    if (key === "visibility-content" && faqFailed) {
      action.sourceFindingKeys = [...action.sourceFindingKeys, WEBSITE_FAQ_TRIGGER];
      if (!findings.length) {
        action.evidence = {
          ...action.evidence,
          source: SOURCE_LABEL.website,
          value: "faq_schema: fail",
          detail: localized("No FAQ structured data was found on the website.", "網站上未找到 FAQ 結構化資料。"),
        };
      }
    }
    actions.push(action);
  }

  const google = input.googleConnection;
  if (!google || ["expired", "revoked", "error"].includes(google.status)) {
    actions.push(
      buildAction(templateByKey("google-reconnect"), [], input, now, {
        source: SOURCE_LABEL.system,
        value: google ? google.status : "not_connected",
        detail: google
          ? localized(`The Google connection is ${google.status}.`, `Google 連接狀態：${google.status}。`)
          : localized("Google Business Profile is not connected.", "尚未連接 Google 商戶檔案。"),
      }),
    );
  }

  // menu-translation has no finding trigger (§3.6.1): it is created from an
  // owner objective in Phase 4's create flow, never derived here.
  return rankActions(actions);
}

export function rankActions(actions: DerivedAction[]): DerivedAction[] {
  return [...actions].sort(
    (a, b) => b.priorityScore - a.priorityScore || a.effortMinutes - b.effortMinutes || a.templateKey.localeCompare(b.templateKey),
  );
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
export async function deriveActionsForSnapshot(db: SupabaseClient, snapshotId: string, opts: { now?: Date } = {}): Promise<UpsertResult & CloseResult> {
  const snapshot = await loadSnapshotById(db, snapshotId);
  if (!snapshot) throw new Error("snapshot_not_found");
  if (!snapshot.workspaceId) throw new Error("snapshot_requires_workspace");
  const workspaceId = snapshot.workspaceId;

  const [findingsResult, diff, brandResult, googleResult, workspaceResult, draftsResult] = await Promise.all([
    db
      .from("audit_findings")
      .select("finding_key, module, severity, score_impact, owner_message_zh, owner_message_en, owner_action_zh, owner_action_en, evidence")
      .eq("job_id", snapshot.jobId)
      .returns<FindingRow[]>(),
    loadDiffForHeadJob(db, snapshot.jobId),
    db.from("brand_profiles").select("workspace_id").eq("workspace_id", workspaceId).maybeSingle(),
    db
      .from("oauth_connections")
      .select("status, created_at")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_gbp")
      .order("created_at", { ascending: false })
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

  const { data: priorAudit } = await db.from("audit_events").select("id").eq("event", "action.derived").eq("entity_id", snapshotId).limit(1);
  if (!priorAudit?.length) {
    await db.from("audit_events").insert({
      workspace_id: workspaceId,
      location_id: snapshot.locationId,
      actor_type: "system",
      actor_id: null,
      event: "action.derived",
      entity_type: "scan_snapshot",
      entity_id: snapshotId,
      payload: { locale: null, ...upserted, ...closed },
    });
  }

  return { ...upserted, ...closed };
}
