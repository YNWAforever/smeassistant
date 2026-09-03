import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { loadWorkspaceContext } from "@/lib/workspace/queries";
import { listActions, type ActionFilters } from "@/lib/workspace/queries-pages";

/**
 * GET /api/workspaces/[workspaceId]/actions?location=&view=&channel=&status=&locale=
 * (CLAUDE.md §3.2.3). Any accepted member may list; the role only shapes the
 * UI. Filters are validated here so an unknown value falls back to "all"
 * rather than leaking a query error.
 */
const VIEWS = new Set(["all", "needs_input", "drafts", "awaiting_approval", "completed"]);
const CHANNELS = new Set(["google", "instagram", "website", "search_ai"]);
const STATUSES = new Set(["recommended", "needs_input", "ready", "in_progress", "completed", "dismissed", "cancelled", "expired"]);

export async function GET(req: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  const auth = await authorizeWorkspaceRequest({ id: workspaceId });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "all";
  const channel = url.searchParams.get("channel");
  const status = url.searchParams.get("status");
  const filters: ActionFilters = {
    location: url.searchParams.get("location") ?? "all",
    view: (VIEWS.has(view) ? view : "all") as ActionFilters["view"],
    channel: channel && CHANNELS.has(channel) ? (channel as ActionFilters["channel"]) : undefined,
    status: status && STATUSES.has(status) ? (status as ActionFilters["status"]) : undefined,
  };

  try {
    const ctx = await loadWorkspaceContext(auth.membership);
    const result = await listActions(ctx, filters);
    return NextResponse.json({ actions: result.actions, counts: result.counts });
  } catch {
    console.error("[api/workspaces/actions] list failed", { category: "workspace_actions_list_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
