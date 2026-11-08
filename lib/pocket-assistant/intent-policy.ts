import type { AssistantIntentId, AssistantMode, AssistantSurface } from "./contracts";

export const GENERATION_INTENTS = ["draft_review_reply", "friendlier_review_reply", "generate_social", "generate_faq", "generate_menu", "shorten_review_reply", "contact_review_reply"] as const satisfies readonly AssistantIntentId[];
export function isGenerationIntent(intent: AssistantIntentId): boolean {
  return (GENERATION_INTENTS as readonly string[]).includes(intent);
}
/** Owner generation starts only from the explicit Action Edit launcher. Public samples remain demos. */
export function assistantIntentAllowed(surface: AssistantSurface, intent: AssistantIntentId, mode: AssistantMode, allowGeneration = false): boolean {
  if (!isGenerationIntent(intent)) return true;
  if (mode === "demo" && (surface === "sample" || surface === "report")) return true;
  return surface === "action" && allowGeneration;
}
