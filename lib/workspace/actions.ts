import { localized, type Capability, type FactType, type LocalizedText, type Priority } from "@/lib/domain";
import { applyResolvedInputs } from "./evidence-inputs";
import { scorePriority, type PriorityFactor } from "./priority";
import { type ScanDiffRow, type SnapshotRecord } from "./snapshots";
import { isLedgerOnly, templateByKey, templateForFinding, WEBSITE_FAQ_TRIGGER, type ActionTemplate, type TemplateKey } from "./templates";

/**
 * Action derivation (CLAUDE.md §3.6). Findings with a negative score impact
 * map onto templates; one open action per (workspace, location, template) is
 * kept up to date across snapshots instead of duplicated; resolved findings in
 * a comparable diff close their action as measured, vanished ones expire it.
 */
const EMPTY_RESOLVED: ReadonlySet<string> = new Set<string>();

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
  /**
   * Input keys the scan already answers (lib/workspace/evidence-inputs.ts).
   * Subtracted from every template's requiredInputs, so the owner is never asked
   * to retype evidence the workspace has already collected. Defaults to empty,
   * which reproduces the previous behaviour exactly.
   */
  resolvedInputs?: ReadonlySet<string>;
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
  // What the owner must still supply: the template's ask minus whatever the scan
  // already answers. Used for both the readiness factor and the persisted list,
  // so priority and the input form can never disagree.
  const requiredInputs = applyResolvedInputs(template.requiredInputs, input.resolvedInputs ?? EMPTY_RESOLVED);
  const priority = scorePriority({
    scoreImpact: lead ? impactOf(lead) : -5,
    module: lead?.module ?? "gbp",
    severity: lead?.severity ?? "warning",
    regressed,
    evidenceAgeDays: Number.isFinite(ageDays) ? ageDays : null,
    inputsAvailable: requiredInputs.length === 0,
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
    requiredInputs,
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
