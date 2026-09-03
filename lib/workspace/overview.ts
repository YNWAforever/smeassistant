import { copy, type PrototypeLocale } from "@/lib/copy";
import { DISPLAY_PHASE_KEYS, type DisplayPhaseKey } from "@/lib/copy-workspace";
import {
  isLocalizedText,
  localized,
  type ActionState,
  type ApprovalState,
  type Capability,
  type DeliveryState,
  type FactType,
  type LocalizedText,
  type MeasurementState,
  type Priority,
  type RunState,
} from "@/lib/domain";
import type { PriorityFactor } from "./priority";
import type { TemplateKey } from "./templates";

export { DISPLAY_PHASE_KEYS };
export type { DisplayPhaseKey };

/** What the list and detail pages render (CLAUDE.md §3.4). */
export interface ActionOverview {
  id: string;
  templateKey: TemplateKey;
  capability: Capability;
  location: { id: string | null; slug: string; name: LocalizedText };
  title: LocalizedText;
  summary: LocalizedText;
  evidence: { factType: FactType; source: string; value: string; detail: LocalizedText; observedAt: string; freshness: LocalizedText };
  priority: Priority;
  priorityFactors: Array<{ key: string; label: LocalizedText; points: number }>;
  effortMinutes: number;
  requiredInputs: string[];
  missingInputs: string[];
  assignee?: { id: string; name: string };
  dueAt?: string;
  actionState: ActionState;
  runState: RunState;
  approvalState: ApprovalState;
  deliveryState: DeliveryState;
  measurementState: MeasurementState;
  displayPhase: LocalizedText;
  displayPhaseKey: DisplayPhaseKey;
  latestVersion?: { id: string; versionNo: number; approvalState: ApprovalState; deliveryState: DeliveryState };
  createdAt: string;
  updatedAt: string;
}

export interface ActionRow {
  id: string;
  workspace_id: string;
  location_id: string | null;
  template_key: string;
  source: string;
  source_finding_keys: string[];
  title: unknown;
  summary: unknown;
  evidence: unknown;
  priority: Priority;
  priority_score: number | string;
  priority_factors: unknown;
  effort_minutes: number;
  required_inputs: unknown;
  provided_inputs: unknown;
  assignee_user_id: string | null;
  due_at: string | null;
  action_state: ActionState;
  measurement_state: MeasurementState;
  capability: Capability;
  created_at: string;
  updated_at: string;
}

export interface ActionOverviewContext {
  location: { id: string | null; slug: string; name: LocalizedText } | null;
  latestRun: { state: RunState } | null;
  latestVersion: { id: string; version_no: number; approval_state: ApprovalState; delivery_state: DeliveryState } | null;
  assignee?: { id: string; name: string } | null;
}

export function displayPhaseKey(input: {
  capability: Capability;
  actionState: ActionState;
  runState: RunState | null;
  approvalState: ApprovalState | null;
  deliveryState: DeliveryState;
  measurementState: MeasurementState;
}): DisplayPhaseKey {
  if (input.capability === "Requires connection") return "requires_connection";
  if (input.actionState === "needs_input") return "needs_input";
  if (input.runState === "queued" || input.runState === "running") return "generating";
  if (input.approvalState === "draft") return "draft_ready";
  if (input.approvalState === "changes_requested") return "changes_requested";
  if (input.approvalState === "approved" && input.deliveryState === "export_ready") return "approved_export_ready";
  if (input.deliveryState === "exported") return "exported";
  if (input.measurementState === "awaiting_comparable_scan") return "awaiting_comparable_scan";
  if (input.measurementState === "measured") return "measured";
  return "recommended";
}

export function displayPhaseText(key: DisplayPhaseKey): LocalizedText {
  return { en: copy.en.workspace.phases[key], "zh-HK": copy["zh-HK"].workspace.phases[key], "zh-TW": copy["zh-TW"].workspace.phases[key] };
}

function factorLabel(key: string): LocalizedText {
  const k = key as keyof typeof copy.en.workspace.factors;
  return {
    en: copy.en.workspace.factors[k] ?? key,
    "zh-HK": copy["zh-HK"].workspace.factors[k] ?? key,
    "zh-TW": copy["zh-TW"].workspace.factors[k] ?? key,
  };
}

function text(value: unknown, fallback: LocalizedText): LocalizedText {
  return isLocalizedText(value) ? value : fallback;
}

const ALL_LOCATIONS = localized("All locations", "所有地點");

export function buildActionOverview(row: ActionRow, ctx: ActionOverviewContext): ActionOverview {
  // No run row means nothing has been generated yet: `runState` reports
  // "queued" for the UI's rollup, but the phase derivation must not read it
  // as "generating", so it sees null instead.
  const runState: RunState = ctx.latestRun?.state ?? "queued";
  const approvalState: ApprovalState | null = ctx.latestVersion?.approval_state ?? null;
  const deliveryState: DeliveryState = ctx.latestVersion?.delivery_state ?? "not_requested";
  const required = Array.isArray(row.required_inputs) ? (row.required_inputs as string[]) : [];
  const provided = row.provided_inputs && typeof row.provided_inputs === "object" ? (row.provided_inputs as Record<string, unknown>) : {};
  const missing = required.filter((key) => provided[key] === undefined || provided[key] === null || provided[key] === "");
  const factors = Array.isArray(row.priority_factors) ? (row.priority_factors as PriorityFactor[]) : [];
  const evidence = (row.evidence && typeof row.evidence === "object" ? row.evidence : {}) as Partial<ActionOverview["evidence"]>;
  const phaseKey = displayPhaseKey({
    capability: row.capability,
    actionState: row.action_state,
    runState: ctx.latestRun?.state ?? null,
    approvalState,
    deliveryState,
    measurementState: row.measurement_state,
  });
  return {
    id: row.id,
    templateKey: row.template_key as TemplateKey,
    capability: row.capability,
    location: ctx.location ?? { id: row.location_id, slug: "all", name: ALL_LOCATIONS },
    title: text(row.title, localized(row.template_key, row.template_key)),
    summary: text(row.summary, localized("", "")),
    evidence: {
      factType: (evidence.factType as FactType) ?? "Observed",
      source: evidence.source ?? "",
      value: evidence.value ?? "",
      detail: text(evidence.detail, localized("", "")),
      observedAt: evidence.observedAt ?? row.updated_at,
      freshness: text(evidence.freshness, localized("", "")),
    },
    priority: row.priority,
    priorityFactors: factors.map((factor) => ({ key: factor.key, label: factorLabel(factor.key), points: factor.points })),
    effortMinutes: row.effort_minutes,
    requiredInputs: required,
    missingInputs: missing,
    assignee: ctx.assignee ?? undefined,
    dueAt: row.due_at ?? undefined,
    actionState: row.action_state,
    runState,
    approvalState: approvalState ?? "draft",
    deliveryState,
    measurementState: row.measurement_state,
    displayPhase: displayPhaseText(phaseKey),
    displayPhaseKey: phaseKey,
    latestVersion: ctx.latestVersion
      ? {
          id: ctx.latestVersion.id,
          versionNo: ctx.latestVersion.version_no,
          approvalState: ctx.latestVersion.approval_state,
          deliveryState: ctx.latestVersion.delivery_state,
        }
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function localeOf(locale: string): PrototypeLocale {
  return locale === "en" || locale === "zh-TW" ? locale : "zh-HK";
}
