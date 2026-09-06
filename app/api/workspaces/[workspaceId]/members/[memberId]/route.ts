import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { membershipRepository, type MemberRow } from "@/lib/repositories/membership";
import { recordClaimAuditEvent } from "@/lib/repositories/claims";
import { ipHashFor } from "@/lib/workspace/audit";
import { loadLocationIds } from "@/lib/workspace/team";

/**
 * PATCH /api/workspaces/[workspaceId]/members/[memberId]
 *   { role?: 'manager'|'viewer'; location_scope?: string[] | null } → { ok }
 *
 * Owner only (CLAUDE.md §3.9 team settings). The owner row is immutable here
 * — ownership transfer is a separate, not-yet-built concern (same non-goal
 * as the invite route). `location_scope` must name locations of this
 * workspace; null means all locations. Writes `member.role_changed` (§3.11).
 */
const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SCOPE = 50;

type Body = { role?: unknown; location_scope?: unknown; locale?: unknown };

export async function PATCH(req: Request, { params }: { params: Promise<{ workspaceId: string; memberId: string }> }) {
  const { workspaceId, memberId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }
  if (!memberId || memberId.length > 128) {
    return NextResponse.json({ error: "memberId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const updates: { role?: "manager" | "viewer"; location_scope?: string[] | null } = {};
  if (body.role !== undefined) {
    if (body.role !== "manager" && body.role !== "viewer") {
      return NextResponse.json({ error: "role must be manager or viewer" }, { status: 400 });
    }
    updates.role = body.role;
  }
  const db = membershipRepository;
  if (body.location_scope !== undefined) {
    if (body.location_scope === null) {
      updates.location_scope = null;
    } else {
      const scope = body.location_scope;
      if (!Array.isArray(scope) || scope.length > MAX_SCOPE || scope.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
        return NextResponse.json({ error: "location_scope must be a list of location ids or null" }, { status: 400 });
      }
      const ids = [...new Set(scope as string[])];
      let known: Set<string>;
      try {
        known = await loadLocationIds(db, workspaceId);
      } catch {
        return NextResponse.json({ error: "unavailable" }, { status: 503 });
      }
      if (ids.some((id) => !known.has(id))) {
        return NextResponse.json({ error: "location_scope must name locations of this workspace" }, { status: 400 });
      }
      // An empty list would be "no locations": treat it as "all" (null) so a
      // cleared multi-select never locks a manager out of everything.
      updates.location_scope = ids.length ? ids : null;
    }
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  // Scoped by workspace_id on every read/write: a foreign memberId matches no row.
  let target: MemberRow | null;
  try { target = await db.member(workspaceId,memberId); }
  catch { return NextResponse.json({error:"unavailable"},{status:503}); }
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (target.role === "owner") return NextResponse.json({ error: "owner row is immutable" }, { status: 403 });

  try {
    if (!await db.update(workspaceId,memberId,updates)) return NextResponse.json({error:"not found"},{status:404});
  } catch {
    console.error("Workspace member update failed");
    return NextResponse.json({error:"unavailable"},{status:500});
  }

  const candidate = typeof body.locale === "string" ? body.locale : req.headers.get("x-sme-locale") ?? "";
  await recordClaimAuditEvent({
    workspace_id: workspaceId,
    actor_type: "user",
    actor_id: auth.user.id,
    event: "member.role_changed",
    entity_type: "workspace_member",
    entity_id: memberId,
    payload: {
      locale: isLocale(candidate) ? candidate : DEFAULT_LOCALE,
      ...(ipHashFor(req) ? {ip_hash:ipHashFor(req)} : {}),
      from_role: target.role,
      role: updates.role ?? target.role,
      location_scope: updates.location_scope === undefined ? target.location_scope : updates.location_scope,
    },
  });

  return NextResponse.json({ ok: true });
}
