import type { Metadata } from "next";

import { ActionsListView } from "@/components/workspace/actions-list-view";
import type { ActionState } from "@/lib/domain";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { listActions, type ActionFilters } from "@/lib/workspace/queries-pages";

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
  };
  const result = await listActions(page.ctx, filters);
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
    />
  );
}
