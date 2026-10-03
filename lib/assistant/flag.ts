/**
 * P4.3 feature flag. On only for the exact string "true"; anything else
 * (unset, "TRUE", "1", " true") keeps behaviour identical to before the slice.
 */
export function contextualAssistantEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CONTEXTUAL_ASSISTANT_ENABLED === "true"
}
