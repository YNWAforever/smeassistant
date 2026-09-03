import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { isLocale } from "@/lib/locale";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { supabaseServer } from "@/lib/supabase/admin";
import { insertAsset, isAllowedMime, isAssetKind, listAssets, MAX_ASSET_BYTES, signedUrlFor } from "@/lib/workspace/assets";
import { ipHashFor, recordEvent } from "@/lib/workspace/audit";
import { loadWorkspaceContext } from "@/lib/workspace/queries";

/**
 * GET  /api/workspaces/[workspaceId]/assets            → { assets: AssetItem[] } (any accepted member; 60 s signed URLs)
 * POST /api/workspaces/[workspaceId]/assets (multipart: file, kind, location_id?, alt_text?, locale?) → 201 { assetId, signedUrl }
 *   owner / manager-in-scope for `location_id` (§3.9); 5 MB and the bucket's
 *   mime allowlist enforced here as well as by Storage; storage path
 *   `${workspaceId}/${assetId}/${filename}`; audit `asset.uploaded` (§3.11).
 *   Rights start at needs_review: upload is never permission to publish.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(error: string, status = 400): Response {
  return NextResponse.json({ error }, { status });
}

export async function GET(_req: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  const auth = await authorizeWorkspaceRequest({ id: workspaceId });
  if (!auth.ok) return bad(auth.code, auth.status);
  try {
    const ctx = await loadWorkspaceContext(auth.membership);
    const assets = await listAssets(supabaseServer(), workspaceId, ctx.locations);
    return NextResponse.json({ assets });
  } catch {
    console.error("[api/workspaces/assets] list failed", { category: "asset_list_failed" });
    return bad("unavailable", 503);
  }
}

export async function POST(req: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  if (!UUID.test(workspaceId)) return bad("not_found", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("invalid_multipart");
  }
  const file = form.get("file");
  const kind = form.get("kind");
  const rawLocation = form.get("location_id");
  const rawAlt = form.get("alt_text");
  const rawLocale = form.get("locale");
  const locationId = typeof rawLocation === "string" && rawLocation.trim() ? rawLocation.trim() : null;
  const altText = typeof rawAlt === "string" && rawAlt.trim() ? rawAlt.trim().slice(0, 500) : null;
  const locale = typeof rawLocale === "string" && isLocale(rawLocale) ? rawLocale : null;
  if (!(file instanceof Blob)) return bad("file_required");
  if (!isAssetKind(kind)) return bad("invalid_kind");
  if (locationId && !UUID.test(locationId)) return bad("invalid_location");
  if (!isAllowedMime(file.type)) return bad("unsupported_type", 415);
  if (file.size <= 0) return bad("empty_file");
  if (file.size > MAX_ASSET_BYTES) return bad("file_too_large", 413);

  // Role + location scope before any storage work (guardrail 9).
  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager", ...(locationId ? { locationId } : {}) });
  if (!auth.ok) return bad(auth.code, auth.status);

  const limit = await enforceRateLimit({ req, scope: "asset_upload", identifiers: [auth.user.id], failClosed: true });
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  const db = supabaseServer();
  try {
    if (locationId) {
      const ctx = await loadWorkspaceContext(auth.membership);
      if (!ctx.locations.some((l) => l.id === locationId)) return bad("invalid_location");
    }
    const filename = file instanceof File && file.name ? file.name : `asset.${file.type.split("/")[1] ?? "bin"}`;
    const asset = await insertAsset(db, {
      workspaceId,
      locationId,
      kind,
      filename,
      contentType: file.type,
      bytes: file,
      altText,
      uploadedBy: auth.user.id,
    });
    await recordEvent(db, {
      workspaceId,
      locationId,
      actorType: "user",
      actorId: auth.user.id,
      event: "asset.uploaded",
      entityType: "asset",
      entityId: asset.id,
      locale,
      ipHash: ipHashFor(req),
      payload: { kind, filename: asset.filename, bytes: file.size, content_type: file.type },
    });
    const signedUrl = await signedUrlFor(db, asset.storage_path);
    return NextResponse.json({ assetId: asset.id, signedUrl }, { status: 201 });
  } catch (error) {
    const category = error instanceof Error && error.message === "asset_storage_upload_failed" ? "asset_storage_upload_failed" : "asset_insert_failed";
    console.error("[api/workspaces/assets] upload failed", { category });
    return bad("unavailable", 503);
  }
}
