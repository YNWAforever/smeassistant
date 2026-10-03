import { NextResponse } from "next/server";
import { contextualAssistantEnabled } from "@/lib/assistant/flag";
import { AssistantAccessError } from "@/lib/assistant/errors";
import { loadSuggestions } from "@/lib/assistant/suggestions";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { artifactRepository } from "@/lib/repositories/artifacts";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";

/**
 * GET /api/assistant/suggestions?workspaceId=&locationId=&actionId=&versionId=
 * (P4.3). The questions the Visibility Operator sheet offers on its own, from
 * the caller's current workspace state. Read-only: no model, no audit row.
 * With CONTEXTUAL_ASSISTANT_ENABLED off it answers an empty list before any
 * auth, limiter or database call.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status, headers: HEADERS });
}

/** undefined = absent, null = present but not a UUID. */
function optionalId(value: string | null): string | undefined | null {
  if (value === null || value === "") return undefined;
  return UUID_RE.test(value) ? value.toLowerCase() : null;
}

export async function GET(request: Request) {
  if (!contextualAssistantEnabled()) return json({ suggestions: [] });

  const params = new URL(request.url).searchParams;
  const workspaceId = optionalId(params.get("workspaceId"));
  const ids = { locationId: optionalId(params.get("locationId")), actionId: optionalId(params.get("actionId")), versionId: optionalId(params.get("versionId")) };
  if (!workspaceId || Object.values(ids).some((id) => id === null)) return json({ error: "invalid_context" }, 400);

  const auth = await authorizeWorkspaceRequest({ id: workspaceId });
  if (!auth.ok) return json({ error: auth.code }, auth.status);

  const decision = await enforceRateLimit({ req: request, scope: "assistant_suggestions", identifiers: [auth.user.id], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  try {
    const suggestions = await loadSuggestions({
      db: artifactRepository(),
      membership: auth.membership,
      context: { workspaceId, locationId: ids.locationId ?? undefined, actionId: ids.actionId ?? undefined, versionId: ids.versionId ?? undefined },
    });
    return json({ suggestions });
  } catch (error) {
    if (error instanceof AssistantAccessError) return json({ error: error.code }, error.status);
    console.error("[api/assistant/suggestions] failed", { category: "assistant_suggestions_failed" });
    return json({ error: "unavailable" }, 503);
  }
}
