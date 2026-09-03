import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/admin";
import { normalizeInstagramHandle } from "@/lib/scanner/ig-search/handle";

const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Saves an eyeball-confirmed Instagram handle for a claimed workspace --
 * NOT an OAuth connection. No idempotency key needed (a plain profile field,
 * not a scarce external resource) -- last-write-wins between two tabs is fine.
 *
 * Ported from upstream's /api/owner/workspaces/[workspaceId]/instagram-handle.
 * Authorization goes through this app's authorizeWorkspaceRequest (owner
 * only: integrations are an owner setting, CLAUDE.md §3.9; staff sessions are
 * never accepted). On success the primary location's ig_handle is kept in
 * step and an `integration.updated` audit event is written (§3.11).
 */
export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  let body: { handle?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.handle === "string" ? body.handle : "";
  const handle = normalizeInstagramHandle(raw);
  if (!handle) {
    return NextResponse.json({ error: "handle is invalid" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { error } = await supabase
    .from("workspaces")
    .update({ instagram_handle: handle })
    .eq("id", workspaceId);
  if (error) {
    console.error("Workspace instagram_handle save failed");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  // The primary location mirrors the workspace-level handle so rescans and
  // the location cards read the confirmed value. Best-effort: the workspace
  // row is the source of truth and is already saved.
  const { error: locationError } = await supabase
    .from("locations")
    .update({ ig_handle: handle })
    .eq("workspace_id", workspaceId)
    .eq("is_primary", true);
  if (locationError) console.error("Primary location ig_handle sync failed");

  const { error: eventError } = await supabase.from("audit_events").insert({
    workspace_id: workspaceId,
    actor_type: "user",
    actor_id: auth.user.id,
    event: "integration.updated",
    entity_type: "workspace",
    entity_id: workspaceId,
    payload: { locale: typeof body.locale === "string" ? body.locale : null, integration: "instagram", handle },
  });
  if (eventError) console.error("Instagram handle audit event not recorded");

  return NextResponse.json({ ok: true, handle });
}
