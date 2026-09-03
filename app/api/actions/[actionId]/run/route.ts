import { authorizeActionMutation, json, localeFrom, readJson } from "@/app/api/actions/_shared/mutation";
import { RunError, runAgentForAction } from "@/lib/workspace/runs";

/**
 * POST /api/actions/[actionId]/run { agentKey?, inputs? } (CLAUDE.md §3.2.3).
 * Runs inline: the agent call is bounded at 45 s by AGENT_LLM_OPTIONS and
 * retried once, so the handler needs a minute.
 */
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_run");
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  const agentKey = typeof body?.agentKey === "string" ? body.agentKey : undefined;
  const inputs = body?.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs) ? (body.inputs as Record<string, unknown>) : undefined;

  try {
    const result = await runAgentForAction(auth.db, { actionId, actorId: auth.user.id, agentKey, inputs, locale: localeFrom(req, body), ipHash: auth.ipHash });
    return json(result);
  } catch (error) {
    if (error instanceof RunError) {
      return json({ error: error.code === "action_not_found" ? "not_found" : "agent_unavailable" }, error.code === "action_not_found" ? 404 : 409);
    }
    console.error("[api/actions/run] failed", { category: "action_run_route_failed" });
    return json({ error: "unavailable" }, 503);
  }
}
