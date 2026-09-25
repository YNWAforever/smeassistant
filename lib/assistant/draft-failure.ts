import { t } from "@/lib/i18n";

/**
 * A failed assistant draft stores its reason code in action_runs.error
 * (lib/repositories/artifacts.ts recordAssistantDraftFailure). Owners see a
 * short label in their locale instead of the code. Any other error string is
 * returned unchanged: task runs already store owner-facing text. Client-safe.
 */
const DRAFT_FAILURE_KEYS: Record<string, string> = {
  facts_needed: "draftFailure.factsNeeded",
  invalid_output: "draftFailure.invalidOutput",
  no_model_output: "draftFailure.noModelOutput",
};

export function runErrorLabel(locale: string, error: string): string {
  const key = Object.hasOwn(DRAFT_FAILURE_KEYS, error) ? DRAFT_FAILURE_KEYS[error] : undefined;
  return key ? t(locale, key) : error;
}
