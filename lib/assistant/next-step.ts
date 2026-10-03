import type { AssistantNextStep } from "@/lib/pocket-assistant/contracts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string | undefined): value is string {
  return typeof value === "string" && UUID.test(value)
}

/**
 * Maps a next step to an in-workspace link. Navigation only: it never writes.
 * `basePath` is `/{locale}/owner/{workspaceSlug}`. Returns null when a required
 * id is missing or is not a UUID, so a bad id can never reshape the path.
 * `?location=` goes before any fragment.
 */
export function nextStepHref(basePath: string, step: AssistantNextStep, location?: string): string | null {
  const loc = location ? `location=${encodeURIComponent(location)}` : ""
  const withQuery = (path: string, params: string[], fragment = "") => {
    const query = [...params, loc].filter(Boolean).join("&")
    return `${basePath}${path}${query ? `?${query}` : ""}${fragment}`
  }
  switch (step.kind) {
    case "provide_inputs":
      return isUuid(step.actionId) ? withQuery(`/actions/${step.actionId}`, [], "#inputs") : null
    case "review_version":
      return isUuid(step.actionId) && isUuid(step.versionId)
        ? withQuery(`/actions/${step.actionId}`, [`version=${step.versionId}`])
        : null
    case "open_action":
      return isUuid(step.actionId) ? withQuery(`/actions/${step.actionId}`, []) : null
    case "open_integrations":
      return withQuery("/settings/integrations", [])
    case "open_actions":
      return withQuery("/actions", [])
    default:
      return null
  }
}
