import type { ReportAccess } from "./authorize-report";

export type ReportVisibility = "preview" | "full";

/** Only the authorization decision controls whether the full report renders. */
export function reportVisibility(access: ReportAccess): ReportVisibility {
  return access.kind === "public" ? "preview" : "full";
}