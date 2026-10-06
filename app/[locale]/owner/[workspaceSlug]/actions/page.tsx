import type { Metadata } from "next";

import { ActionsListView } from "@/components/workspace/actions-list-view";
import type { ActionState } from "@/lib/domain";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { listActions, type ActionFilters } from "@/lib/workspace/queries-pages";
import { actionBulkAssignEnabled } from "@/lib/workspace/bulk-flag";
import { membershipRepository } from "@/lib/repositories/membership";

export const dynamic = "force-dynamic";

const VIEWS = new Set(["all", "needs_input", "drafts", "awaiting_approval", "completed"]);
const CHANNELS = new Set(["google", "instagram", "website", "search_ai"]);
const STATUSES = new Set(["recommended", "needs_input", "ready", "in_progress", "completed", "dismissed", "cancelled", "expired"]);

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Actions", zh: "行動" });
}

export default async function ActionsRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const view = page.query.view && VIEWS.has(page.query.view) ? (page.query.view as ActionFilters["view"]) : "all";
  const filters: ActionFilters = {
    location: page.locationSlug,
    view,
    channel: page.query.channel && CHANNELS.has(page.query.channel) ? (page.query.channel as ActionFilters["channel"]) : undefined,
    status: page.query.status && STATUSES.has(page.query.status) ? (page.query.status as ActionState) : undefined,
    cursor: page.query.cursor,
    q: page.query.q,
    assignee: page.query.assignee,
    due: page.query.due as ActionFilters["due"],
    pageSize: page.query.pageSize === undefined ? undefined : Number(page.query.pageSize),
  };
  let result;
  try { result = await listActions(page.ctx, filters); }
  catch (error) {
    if (!(error instanceof Error) || !["invalid_action_cursor", "invalid_action_page_size", "invalid_action_filter"].includes(error.message)) throw error;
    return <div role="alert"><p>{page.locale === "en" ? "This page link is invalid or its filters have changed. Refresh the list." : "此頁連結無效或篩選條件已變更，請重新載入清單。"}</p><a href={`/${page.locale}/owner/${page.workspaceSlug}/actions`}>{page.locale === "en" ? "Refresh list" : "重新載入清單"}</a></div>;
  }
  const members = (await membershipRepository.team(page.ctx.workspace.id)).filter(m => m.accepted_at && m.user_id && ["owner","manager"].includes(m.role)).map(m => ({ id: m.user_id!, name: m.email }));
  return (
    <ActionsListView
      locale={page.locale}
      workspaceSlug={page.workspaceSlug}
      workspaceId={page.ctx.workspace.id}
      timezone={page.ctx.workspace.timezone}
      role={page.membership.role}
      locations={page.locations}
      locationId={page.ctx.locations.find((l) => l.slug === page.locationSlug)?.id ?? null}
      filters={filters}
      result={result}
      bulkEnabled={actionBulkAssignEnabled()}
      members={members}
    />
  );
}
