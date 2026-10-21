import type { Metadata } from "next";
import Link from "next/link";
import { Maximize2, X } from "lucide-react";

import { UUID_RE } from "@/app/api/actions/_shared/mutation";
import { ActionDetailPanel } from "@/components/workspace/action-detail-panel";
import { loadActionDetailProps } from "@/lib/workspace/action-detail-props";
import { bulkApproveItems, isBulkApprovable } from "@/lib/workspace/bulk-approve";
import { workspaceReadRepository } from "@/lib/repositories/workspace-read";
import { withLocation } from "@/lib/workspace/format";

import { ActionsListView, tabHref } from "@/components/workspace/actions-list-view";
import { ActionsQueueFrame, type QueueView } from "@/components/workspace/actions-queue-frame";
import { FixPackCard } from "@/components/workspace/fix-pack-card";
import { copy } from "@/lib/copy";
import { CalendarView } from "@/components/workspace/calendar-view";
import type { ActionState } from "@/lib/domain";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getCalendar, listActions, type ActionFilters } from "@/lib/workspace/queries-pages";
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
  // ?view=due is the old Calendar (dated work and the rescan cadence); ?view=fixpack is the
  // Fix Pack drafts card that used to sit on Today. Both are views of the same queue.
  if (page.query.view === "due" || page.query.view === "fixpack") {
    const queueView: QueueView = page.query.view;
    const base = `/${page.locale}/owner/${page.workspaceSlug}`;
    const frame = { locale: page.locale, workspaceSlug: page.workspaceSlug, role: page.membership.role, view: queueView, location: page.locationSlug, tabHref: (key: QueueView) => tabHref(base, { location: page.locationSlug }, key) };
    if (queueView === "due") {
      const model = await getCalendar(page.ctx, page.locationSlug);
      return <ActionsQueueFrame {...frame}><CalendarView locale={page.locale} workspaceSlug={page.workspaceSlug} timezone={page.ctx.workspace.timezone} model={model} embedded /></ActionsQueueFrame>;
    }
    return (
      <ActionsQueueFrame {...frame}>
        <p className="limitation-note">{copy[page.locale].shell.views.fixPackLead}</p>
        <FixPackCard locale={page.locale} workspaceId={page.ctx.workspace.id} viewerRole={page.membership.role} actionsHref={`${base}/actions?view=drafts`} />
      </ActionsQueueFrame>
    );
  }
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
    return <div role="alert"><p>{copy[page.locale].workspaceActions.actionsList.thisPageLinkIs}</p><a href={`/${page.locale}/owner/${page.workspaceSlug}/actions`}>{copy[page.locale].workspaceActions.actionsList.refreshList}</a></div>;
  }
  // ?open=id: the action's detail beside the list (wide screens). The same loader as the full
  // page, so it carries the same membership and location checks; an unknown id shows no panel.
  const openId = page.query.open && UUID_RE.test(page.query.open) ? page.query.open : null;
  const openDetail = openId ? await loadActionDetailProps(page, openId, page.query.version ?? null) : null;
  const base = `/${page.locale}/owner/${page.workspaceSlug}`;
  const closeQuery = new URLSearchParams(Object.entries(page.query).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "open" && entry[0] !== "version"));
  const panelCopy = copy[page.locale].shell.panel;
  const panel = openDetail && openId ? (
    <aside className="action-side-panel" aria-label={panelCopy.label}>
      <div className="action-side-panel-bar">
        <Link href={`${base}/actions${closeQuery.size ? `?${closeQuery}` : ""}`} scroll={false}><X aria-hidden="true" />{panelCopy.close}</Link>
        <Link href={withLocation(`${base}/actions/${openId}`, page.locationSlug)}><Maximize2 aria-hidden="true" />{panelCopy.fullPage}</Link>
      </div>
      <ActionDetailPanel {...openDetail} />
    </aside>
  ) : undefined;
  // Bulk approve: read the full text only for drafts that already qualify, so each can be read before approving.
  const candidates = result.actions.filter((action) => isBulkApprovable(action, page.membership));
  const candidateVersions = candidates.length ? await workspaceReadRepository().versions(page.ctx.workspace.id, candidates.map((action) => action.id)).catch(() => []) : [];
  const bulkApprove = bulkApproveItems(candidates, page.membership, candidateVersions);
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
      panel={panel}
      bulkApprove={bulkApprove}
    />
  );
}
