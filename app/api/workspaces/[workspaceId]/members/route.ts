import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/admin";

/**
 * Invite (POST) and remove (DELETE) non-owner workspace members.
 *
 * "owner" is never an acceptable role here — ownership transfer is a
 * separate, not-yet-built concern (upstream docs/superpowers/specs/2026-08-19-workspace-team-roles-l2-design.md,
 * Non-goals).
 *
 * Ported from upstream's /api/owner/workspaces/[workspaceId]/members. Upstream
 * let managers invite and remove too; here team settings are owner-only
 * (CLAUDE.md §3.9), enforced by authorizeWorkspaceRequest's minRole. Staff
 * sessions are never accepted. Invites write a `member.invited` audit event.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;
// memberId is deliberately only length-checked, not UUID-format-checked: it's
// scoped by an `.eq("workspace_id", workspaceId)` filter alongside `.eq("id",
// memberId)` on every read/delete, so a malformed value just matches no row
// (404) rather than reading across workspaces — no format check is load-bearing
// for safety here.

export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  let body: { email?: unknown; role?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "email is invalid" }, { status: 400 });
  }
  const role = body.role === "manager" || body.role === "viewer" ? body.role : null;
  if (!role) {
    return NextResponse.json({ error: "role must be manager or viewer" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: created, error } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspaceId,
      email,
      role,
      invited_by: auth.user.id,
      invited_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  // 23505 is workspace_members_email_idx_unique: this email already has a
  // row (pending or accepted) on this workspace.
  if ((error as { code?: string } | null)?.code === "23505") {
    return NextResponse.json({ error: "already invited" }, { status: 409 });
  }
  if (error || !created) {
    console.error("Workspace member invite failed");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  // Best-effort audit trail (§3.11). The invite row exists; a failed log
  // write must not turn a successful invite into an error.
  const { error: eventError } = await supabase.from("audit_events").insert({
    workspace_id: workspaceId,
    actor_type: "user",
    actor_id: auth.user.id,
    event: "member.invited",
    entity_type: "workspace_member",
    entity_id: created.id,
    payload: { locale: typeof body.locale === "string" ? body.locale : null, role },
  });
  if (eventError) console.error("Workspace member invite audit event not recorded");

  return NextResponse.json({ memberId: created.id }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  const memberId = new URL(req.url).searchParams.get("memberId");
  if (!memberId || memberId.length > 128) {
    return NextResponse.json({ error: "memberId is invalid" }, { status: 400 });
  }

  const supabase = supabaseServer();
  // Deliberately no `.not("accepted_at", "is", null)` filter here: a still-
  // pending invite must be reachable too, so a mis-sent or poisoned invite can
  // be rescinded before it's ever accepted. The owner-row-protection check
  // below is unaffected -- it only changes whether a pending row is found at
  // all, not who may remove what once found.
  const { data: target } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("id", memberId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Only the owner may remove the owner row — a manager removing it would let
  // a workspace end up with no owner at all. minRole above already makes the
  // caller an owner; kept as defence in depth should that ever loosen.
  if (target.role === "owner" && auth.membership.role !== "owner") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { error } = await supabase.from("workspace_members").delete().eq("id", memberId).eq("workspace_id", workspaceId);
  if (error) {
    console.error("Workspace member removal failed");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
