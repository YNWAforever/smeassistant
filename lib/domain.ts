/**
 * Domain enums shared by the workspace data layer and the UI (CLAUDE.md §3.4).
 * Moved here from lib/demo-data.ts, which re-exports them unchanged so the
 * prototype surfaces keep compiling.
 */
export type Capability = "Live" | "Beta" | "Demo" | "Requires connection" | "Planned";
export type ProviderState = "measured" | "unavailable" | "unsupported" | "failed" | "pending";
export type ActionState = "recommended" | "needs_input" | "ready" | "in_progress" | "completed" | "dismissed" | "cancelled" | "expired";
export type RunState = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
export type ApprovalState = "draft" | "changes_requested" | "approved" | "rejected" | "superseded";
export type DeliveryState = "not_requested" | "export_ready" | "exported" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
export type MeasurementState = "not_eligible" | "awaiting_comparable_scan" | "measured" | "insufficient_coverage";
export type FactType = "Observed" | "Inference" | "Recommended" | "Attributed" | "Estimated" | "Unknown";
export type Priority = "urgent" | "high" | "medium" | "low";

export type LocalizedText = { en: string; "zh-HK": string; "zh-TW": string };

export const OPEN_ACTION_STATES: ActionState[] = ["recommended", "needs_input", "ready", "in_progress"];
export const CLOSED_ACTION_STATES: ActionState[] = ["completed", "dismissed", "cancelled", "expired"];

export function localized(en: string, zhHK: string, zhTW: string = zhHK): LocalizedText {
  return { en, "zh-HK": zhHK, "zh-TW": zhTW };
}

export function resolveText(text: LocalizedText | null | undefined, locale: string): string {
  if (!text) return "";
  if (locale === "zh-HK" || locale === "zh-TW") return text[locale] || text["zh-HK"] || text.en;
  return text.en || text["zh-HK"];
}

export function isLocalizedText(value: unknown): value is LocalizedText {
  return Boolean(value && typeof value === "object" && typeof (value as LocalizedText).en === "string");
}
