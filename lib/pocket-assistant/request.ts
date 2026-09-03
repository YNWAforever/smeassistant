import type {
  AssistantContext,
  AssistantMode,
  AssistantRunRequest,
  AssistantSurface,
  DemoQuestionId,
} from "@/lib/pocket-assistant/contracts"

export const ASSISTANT_RUN_ENDPOINT = "/api/assistant/run"

/**
 * Builds the body the sheet posts to `POST /api/assistant/run` (§3.8).
 * Demo mode never carries workspace context — the route ignores it anyway,
 * but leaving it out keeps the public surfaces from sending ids at all.
 * Live mode requires a context (the route rejects a live request without one);
 * undefined optional ids are dropped so the JSON body stays minimal.
 */
export function buildAssistantRequest(
  mode: AssistantMode,
  surface: AssistantSurface,
  intentId: DemoQuestionId,
  locale: AssistantRunRequest["locale"],
  context?: AssistantContext,
): AssistantRunRequest {
  const base: AssistantRunRequest = { mode, surface, intentId, locale }
  if (mode !== "live" || !context) return base
  const trimmed: AssistantContext = { workspaceId: context.workspaceId }
  if (context.locationId) trimmed.locationId = context.locationId
  if (context.snapshotId) trimmed.snapshotId = context.snapshotId
  if (context.actionId) trimmed.actionId = context.actionId
  if (context.versionId) trimmed.versionId = context.versionId
  return { ...base, context: trimmed }
}
