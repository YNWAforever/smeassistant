import { authorizeWorkspaceRequest } from "@/lib/auth";
import { json, localeFrom, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { actionBulkAssignEnabled } from "@/lib/workspace/bulk-flag";
import { parseBulkActionUpdate } from "@/lib/workspace/action-assignment";
import { assignmentUpdateService } from "@/lib/workspace/bulk-action-updates";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { ipHashFor } from "@/lib/workspace/audit";
export const maxDuration = 60;
export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  if (!actionBulkAssignEnabled()) return json({ error: "not_found" }, 404);
  const { workspaceId } = await params;
  if (!UUID_RE.test(workspaceId)) return json({ error: "invalid_workspace" }, 400);
  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" });
  if (!auth.ok) return json({ error: auth.code }, auth.status);
  const body = await readJson(req);
  let input;
  try { input = parseBulkActionUpdate(body); } catch { return json({ error: "invalid_bulk_request" }, 400); }
  const decision = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);
  try {
    const results = await assignmentUpdateService().bulk({ workspaceId, userId: auth.user.id, locale: localeFrom(req, null), ipHash: ipHashFor(req) }, input);
    return json({ mode: input.mode, results });
  } catch { return json({ error: "unavailable" }, 503); }
}
