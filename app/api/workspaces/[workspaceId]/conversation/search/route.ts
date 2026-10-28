import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeWorkspaceRequest, inLocationScope } from "@/lib/auth";
import { conversationHomeEnabled } from "@/lib/workspace/conversation-flag";
import { conversationConnectorRepository } from "@/lib/repositories/conversation-connectors";
import { conversationSearchRepository } from "@/lib/repositories/conversation-search";
import { readGscContext } from "@/lib/connectors/gsc";
import { buildSearchBriefs, buildSearchGap, observeSearch } from "@/lib/workspace/search-gap";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const UUID = z.string().uuid();
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
const bad = (error: string, status = 400) => json({ error }, status);
type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(req: Request, { params }: Context) {
  if (!conversationHomeEnabled()) return bad("not_enabled", 404);
  const { workspaceId } = await params, query = new URL(req.url).searchParams;
  if (!UUID.safeParse(workspaceId).success) return bad("not_found", 404);
  const locationId = query.get("location_id");
  if (!UUID.safeParse(locationId).success || query.getAll("location_id").length !== 1) return bad("invalid_location");
  try {
    const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { locationId: locationId! });
    if (!auth.ok) return bad(auth.code, auth.status);
    if (auth.membership.workspaceId !== workspaceId || !inLocationScope(auth.membership, locationId)) return bad("forbidden", 403);
    if (!await conversationConnectorRepository().target(workspaceId, locationId!)) return bad("not_found", 404);
    return json({ records: await conversationSearchRepository().list({ workspaceId, locationId: locationId! }) });
  } catch { return bad("unavailable", 503); }
}

const Input = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("read"), location_id: UUID }).strict(),
  z.object({ operation: z.literal("approve"), location_id: UUID, id: UUID, confirmed: z.literal(true) }).strict(),
  z.object({ operation: z.literal("observe"), location_id: UUID, id: UUID }).strict(),
]);
export async function POST(req: Request, { params }: Context) {
  if (!conversationHomeEnabled()) return bad("not_enabled", 404);
  const { workspaceId } = await params;
  if (!UUID.safeParse(workspaceId).success) return bad("not_found", 404);
  if (Number(req.headers.get("content-length")) > 4096) return bad("invalid_request");
  let body: z.infer<typeof Input>;
  try { const text = await req.text(); if (text.length > 4096) return bad("invalid_request"); body = Input.parse(JSON.parse(text)); }
  catch { return bad("invalid_request"); }
  const scope = { workspaceId, locationId: body.location_id };
  try {
    const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner", locationId: body.location_id });
    if (!auth.ok) return bad(auth.code, auth.status);
    if (auth.membership.workspaceId !== workspaceId || auth.membership.role !== "owner" || !inLocationScope(auth.membership, body.location_id)) return bad("forbidden", 403);
    const target = await conversationConnectorRepository().target(workspaceId, body.location_id);
    if (!target) return bad("not_found", 404);
    const rate = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id, workspaceId, "conversation_search"], failClosed: true });
    if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);
    const repo = conversationSearchRepository();
    if (body.operation === "approve") {
      const record = await repo.approve(scope, body.id, auth.user.id);
      return record ? json({ record }) : bad("not_found", 404);
    }
    const approved = body.operation === "observe" ? await repo.find(scope, body.id) : null;
    if (body.operation === "observe" && !approved) return bad("not_found", 404);
    if (body.operation === "observe" && !approved?.approvedAt) return bad("approval_required", 409);
    const requestedAt = new Date().toISOString();
    const source = await readGscContext({ workspaceId, websiteUrl: target.url, market: target.market, marketOnly: true });
    const gap = buildSearchGap({ market: target.market, websiteUrl: target.url, requestedAt, source });
    if (approved) return json({ observation: observeSearch(approved, gap), source });
    const record = await repo.append(scope, gap, buildSearchBriefs(gap));
    return json({ record, checkedAt: requestedAt }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "owner_required") return bad("forbidden", 403);
    if (error instanceof Error && error.message === "brief_unavailable") return bad("brief_unavailable", 409);
    return bad("unavailable", 503);
  }
}
