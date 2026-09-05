import { NextResponse } from "next/server";
import { AssistantAccessError, isDraftIntent, runLiveAssistant } from "@/lib/assistant/live";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { isLocale } from "@/lib/locale";
import type { PrototypeLocale } from "@/lib/copy";
import { isDemoQuestionId, type AssistantSurface } from "@/lib/pocket-assistant/contracts";
import { createDemoAssistantRun } from "@/lib/pocket-assistant/demo";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";

/**
 * POST /api/assistant/run (CLAUDE.md §3.8).
 *   { mode: "demo"|"live", surface, intentId, locale, context? }
 * demo → createDemoAssistantRun, no auth, context ignored. live → membership
 * of context.workspaceId (manager floor for drafts), one assistant_run token per user, then
 * lib/assistant/live. Draft intents call the model once (45 s bound).
 */
export const maxDuration = 60;

const SURFACES: readonly AssistantSurface[] = ["sample", "report", "home", "actions", "action", "create", "insights", "assets", "rescan", "workspace"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function optionalId(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : null;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "invalid_request" }, 400);

  const { mode, surface, intentId, locale, context } = payload as Record<string, unknown>;
  if (mode !== "demo" && mode !== "live") return json({ error: "invalid_mode" }, 400);
  if (!SURFACES.includes(surface as AssistantSurface)) return json({ error: "invalid_surface" }, 400);
  if (!isDemoQuestionId(intentId)) return json({ error: "invalid_intent" }, 400);
  if (typeof locale !== "string" || !isLocale(locale)) return json({ error: "unsupported_locale" }, 400);

  if (mode === "demo") return json(createDemoAssistantRun(intentId, locale));

  const ctx = context && typeof context === "object" && !Array.isArray(context) ? (context as Record<string, unknown>) : null;
  const workspaceId = optionalId(ctx?.workspaceId);
  if (!workspaceId) return json({ error: "workspaceId is required" }, 400);
  const ids = { locationId: optionalId(ctx?.locationId), snapshotId: optionalId(ctx?.snapshotId), actionId: optionalId(ctx?.actionId), versionId: optionalId(ctx?.versionId) };
  if (Object.values(ids).some((id) => id === null)) return json({ error: "invalid_context" }, 400);

  const auth = isDraftIntent(intentId)
    ? await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" })
    : await authorizeWorkspaceRequest({ id: workspaceId });
  if (!auth.ok) return json({ error: auth.code }, auth.status);
  const decision = await enforceRateLimit({ req: request, scope: "assistant_run", identifiers: [auth.user.id], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  try {
    const result = await runLiveAssistant({
      membership: auth.membership,
      intentId,
      surface: surface as AssistantSurface,
      locale: locale as PrototypeLocale,
      context: { workspaceId, locationId: ids.locationId ?? undefined, snapshotId: ids.snapshotId ?? undefined, actionId: ids.actionId ?? undefined, versionId: ids.versionId ?? undefined },
    });
    return json(result);
  } catch (error) {
    if (error instanceof AssistantAccessError) return json({ error: error.code }, error.status);
    console.error("[api/assistant/run] failed", { category: "assistant_run_failed" });
    return json({ error: "unavailable" }, 503);
  }
}
