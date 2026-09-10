import {
  authorizeActionMutation,
  json,
  localeFrom,
  readJson,
} from "@/app/api/actions/_shared/mutation";
import { RunError, runAgentForAction } from "@/lib/workspace/runs";

/**
 * POST /api/actions/[actionId]/run { agentKey?, inputs? } (CLAUDE.md §3.2.3).
 *
 * Runs inline. The agent loop in lib/workspace/runs.ts is deadline-aware and
 * sized against this value (ROUTE_MAX_DURATION_MS): it reserves finalization
 * time and only starts a retry if enough budget remains, so the terminal state
 * is always persisted. This comment previously claimed two 45 s attempts fit
 * inside 60 s -- they do not, and the overrun stranded runs at 'running'.
 * Keep this number and ROUTE_MAX_DURATION_MS in step.
 */
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ actionId: string }> },
) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_run");
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  const agentKey =
    typeof body?.agentKey === "string" ? body.agentKey : undefined;
  const inputs =
    body?.inputs &&
    typeof body.inputs === "object" &&
    !Array.isArray(body.inputs)
      ? (body.inputs as Record<string, unknown>)
      : undefined;

  try {
    const result = await runAgentForAction(auth.repository, {
      actionId,
      actorId: auth.user.id,
      membership: auth.membership,
      agentKey,
      inputs,
      locale: localeFrom(req, body),
      ipHash: auth.ipHash,
    });
    return json(result);
  } catch (error) {
    if (error instanceof RunError) {
      if (error.code === "forbidden") return json({ error: "forbidden" }, 403);
      return json(
        {
          error:
            error.code === "action_not_found"
              ? "not_found"
              : "agent_unavailable",
        },
        error.code === "action_not_found" ? 404 : 409,
      );
    }
    console.error("[api/actions/run] failed", {
      category: "action_run_route_failed",
    });
    return json({ error: "unavailable" }, 503);
  }
}
