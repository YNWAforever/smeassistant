import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { isLocale } from "@/lib/locale";
import { supabaseServer } from "@/lib/supabase/admin";
import { getAsset, updateAssetRights } from "@/lib/workspace/assets";
import { ipHashFor, recordEvent } from "@/lib/workspace/audit";

/**
 * PATCH /api/workspaces/[workspaceId]/assets/[assetId] { rights_status: 'approved'|'rejected', alt_text?, locale? } → 200
 *   Owner / manager-in-scope for the asset's location (§3.9). Sets
 *   rights_confirmed_at and writes `asset.rights_confirmed` (§3.11). A
 *   `social_post` run only accepts assets whose rights are `approved`.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  rights_status: z.enum(["approved", "rejected"]),
  alt_text: z.string().trim().max(500).nullable().optional(),
  locale: z.string().optional(),
});

function bad(error: string, status = 400): Response {
  return NextResponse.json({ error }, { status });
}

export async function PATCH(req: Request, context: { params: Promise<{ workspaceId: string; assetId: string }> }) {
  const { workspaceId, assetId } = await context.params;
  if (!UUID.test(workspaceId) || !UUID.test(assetId)) return bad("not_found", 404);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return bad("invalid_json");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return bad("invalid_body");
  const body = parsed.data;
  const locale = body.locale && isLocale(body.locale) ? body.locale : null;

  // Membership first (401/404), then the asset's own location for the scope check.
  const member = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" });
  if (!member.ok) return bad(member.code, member.status);

  const db = supabaseServer();
  try {
    const asset = await getAsset(db, workspaceId, assetId);
    if (!asset) return bad("not_found", 404);
    if (asset.location_id) {
      const scoped = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager", locationId: asset.location_id });
      if (!scoped.ok) return bad(scoped.code, scoped.status);
    }
    const updated = await updateAssetRights(db, {
      workspaceId,
      assetId,
      rightsStatus: body.rights_status,
      ...(body.alt_text !== undefined ? { altText: body.alt_text } : {}),
    });
    if (!updated) return bad("not_found", 404);
    await recordEvent(db, {
      workspaceId,
      locationId: updated.location_id,
      actorType: "user",
      actorId: member.user.id,
      event: "asset.rights_confirmed",
      entityType: "asset",
      entityId: assetId,
      locale,
      ipHash: ipHashFor(req),
      payload: { rights_status: updated.rights_status, filename: updated.filename },
    });
    return NextResponse.json({ ok: true, rights_status: updated.rights_status, rights_confirmed_at: updated.rights_confirmed_at });
  } catch {
    console.error("[api/workspaces/assets] rights update failed", { category: "asset_rights_update_failed" });
    return bad("unavailable", 503);
  }
}
