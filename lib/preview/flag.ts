import type { ReportViewModel } from "@/lib/report/view-model";

/**
 * The unsaved preview draft (P4.5, spec §2.1) is off by default. Only the
 * exact string "true" turns it on: "TRUE", "1" or a padded value stay off.
 */
export function previewDraftEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PREVIEW_DRAFT_ENABLED === "true";
}

/**
 * The report card's link to `/start` (spec §3.1): only an unlocked viewer, of
 * a job finished as `done` or `partial` (the same rule as the page and the
 * route, ruling R13), and only with the flag on. Members and staff already
 * have the real workflow; a public preview has no grant. Pure, so deciding the
 * card runs no SQL.
 */
export function previewDraftHrefFor(input: {
  enabled: boolean;
  access: ReportViewModel["access"];
  /** The report job's status (`model.preview.status`). */
  status: string;
  locale: string;
  slug: string;
}): string | undefined {
  if (!input.enabled || input.access !== "viewer") return undefined;
  if (input.status !== "done" && input.status !== "partial") return undefined;
  return `/${input.locale}/start/${encodeURIComponent(input.slug)}`;
}
