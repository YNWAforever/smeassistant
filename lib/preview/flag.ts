/**
 * The unsaved preview draft (P4.5, spec §2.1) is off by default. Only the
 * exact string "true" turns it on: "TRUE", "1" or a padded value stay off.
 */
export function previewDraftEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PREVIEW_DRAFT_ENABLED === "true";
}
