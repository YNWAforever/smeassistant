import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { authorizationOrUnavailable } from "@/lib/security/authorization-boundary";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { conversationHomeEnabled } from "@/lib/workspace/conversation-flag";
import { ConversationDocumentError, conversationDocumentLocationExists, listConversationDocuments, uploadConversationDocument, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_VERSIONS } from "@/lib/workspace/conversation-documents";
import { ipHashFor } from "@/lib/workspace/audit";
import { isLocale } from "@/lib/locale";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });
type Context = { params: Promise<{ workspaceId: string }> };
function location(value: unknown): string | null | undefined {
  if (value === "all") return null;
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : undefined;
}
function failure(error: unknown): Response {
  if (!(error instanceof ConversationDocumentError)) return bad("unavailable", 503);
  const status = error.code === "unsupported_type" ? 415 : error.code === "file_too_large" ? 413 : error.code === "document_not_found" ? 404 : error.code === "unavailable" ? 503 : 400;
  return bad(error.code, status);
}

export async function GET(req: Request, context: Context) {
  if (!conversationHomeEnabled()) return bad("not_found", 404);
  const { workspaceId } = await context.params;
  if (!UUID.test(workspaceId)) return bad("not_found", 404);
  const query = new URL(req.url).searchParams;
  const locationId = location(query.get("location_id"));
  if (locationId === undefined || query.getAll("location_id").length !== 1) return bad("invalid_location");
  const rawIds = query.get("ids");
  if (query.getAll("ids").length > 1 || (rawIds !== null && (rawIds.length > MAX_DOCUMENT_VERSIONS * 37 || !rawIds.length))) return bad("invalid_ids");
  const ids = rawIds === null ? undefined : rawIds.split(",").map(id => id.toLowerCase());
  if (ids && (ids.length > MAX_DOCUMENT_VERSIONS || ids.some(id => !UUID.test(id)) || new Set(ids).size !== ids.length)) return bad("invalid_ids");
  try {
    const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }, locationId ? { locationId } : {}));
    if (!auth) return bad("unavailable", 503);
    if (!auth.ok) return bad(auth.code, auth.status);
    if (auth.membership.workspaceId !== workspaceId || (locationId && auth.membership.role === "manager" && auth.membership.locationScope !== null && !auth.membership.locationScope.includes(locationId))) return bad("forbidden", 403);
    const scope = { workspaceId, locationId };
    if (!await conversationDocumentLocationExists(scope)) return bad("invalid_location");
    return NextResponse.json({ versions: await listConversationDocuments(scope, ids) }, { headers });
  } catch (error) { return failure(error); }
}

/** Bound the complete multipart payload as well as the eventual file before parsing it. */
async function readMultipart(req: Request): Promise<FormData> {
  const maximum = MAX_DOCUMENT_BYTES + 32 * 1024;
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximum) throw new ConversationDocumentError("file_too_large");
  if (!req.body) throw new Error("invalid_multipart");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) { await reader.cancel().catch(() => undefined); throw new ConversationDocumentError("file_too_large"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(req.url, { method: "POST", headers: { "content-type": req.headers.get("content-type") ?? "" }, body: bytes }).formData();
}

export async function POST(req: Request, context: Context) {
  if (!conversationHomeEnabled()) return bad("not_found", 404);
  const { workspaceId } = await context.params;
  if (!UUID.test(workspaceId)) return bad("not_found", 404);
  let form: FormData;
  try { form = await readMultipart(req); }
  catch (error) { return error instanceof ConversationDocumentError ? failure(error) : bad("invalid_multipart"); }
  const locationId = location(form.get("location_id"));
  if (locationId === undefined || form.getAll("location_id").length !== 1) return bad("invalid_location");
  const file = form.get("file");
  if (!(file instanceof File) || form.getAll("file").length !== 1) return bad("file_required");
  if (file.size > MAX_DOCUMENT_BYTES) return bad("file_too_large", 413);
  const rawDocument = form.get("document_id");
  if (form.getAll("document_id").length > 1 || (rawDocument !== null && (typeof rawDocument !== "string" || !UUID.test(rawDocument)))) return bad("invalid_document");
  const documentId = typeof rawDocument === "string" ? rawDocument.toLowerCase() : undefined;
  try {
    const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner", ...(locationId ? { locationId } : {}) }));
    if (!auth) return bad("unavailable", 503);
    if (!auth.ok) return bad(auth.code, auth.status);
    if (auth.membership.workspaceId !== workspaceId || auth.membership.role !== "owner") return bad("forbidden", 403);
    if (!await conversationDocumentLocationExists({ workspaceId, locationId })) return bad("invalid_location");
    const limit = await enforceRateLimit({ req, scope: "asset_upload", identifiers: [auth.user.id], failClosed: true });
    if (!limit.allowed) {
      const response = rateLimitedResponse(limit.retryAfterSeconds);
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      return response;
    }
    const rawLocale = form.get("locale");
    const version = await uploadConversationDocument({ workspaceId, locationId, documentId, file, uploadedBy: auth.user.id, locale: typeof rawLocale === "string" && isLocale(rawLocale) ? rawLocale : null, ipHash: ipHashFor(req) });
    return NextResponse.json({ version }, { status: 201, headers });
  } catch (error) { return failure(error); }
}
