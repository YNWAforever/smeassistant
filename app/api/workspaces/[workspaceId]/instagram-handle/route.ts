import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { workspaceProfileRepository } from "@/lib/repositories/workspace-profile";
import { recordNeonEvent } from "@/lib/workspace/audit";
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

  const repo = workspaceProfileRepository();
  try { await repo.setInstagramHandle(workspaceId, handle); }
  catch {
    console.error("Workspace instagram_handle save failed");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  // The workspace is already saved; primary-location sync and audit are best-effort.
  try { await repo.syncPrimaryInstagramHandle(workspaceId, handle); }
  catch { console.error("Primary location ig_handle sync failed"); }
  try {
    await recordNeonEvent({
      workspaceId, actorType: "user", actorId: auth.user.id,
      event: "integration.updated", entityType: "workspace", entityId: workspaceId,
      locale: typeof body.locale === "string" ? body.locale : null,
      payload: { integration: "instagram", handle },
    });
  } catch { console.error("Instagram handle audit event not recorded"); }

  return NextResponse.json({ ok: true, handle });
}
