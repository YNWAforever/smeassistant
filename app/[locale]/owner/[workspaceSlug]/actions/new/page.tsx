import type { Metadata } from "next";

import { CreateView } from "@/components/workspace/create-view";
import { NewModeTabs, type NewMode } from "@/components/workspace/new/new-mode-tabs";
import OffersMode from "@/components/workspace/new/offers-mode";
import { PackCard } from "@/components/workspace/pack-card";
import { copy } from "@/lib/copy";
import { resolveText } from "@/lib/domain";
import { offerPromotionsEnabled } from "@/lib/workspace/offers-flag";
import { loadHomeWorkPacks } from "@/lib/workspace/packs";
import { workPacksEnabled } from "@/lib/workspace/packs-flag";
import { inScopeFor, loadOwnerPage, ownerPageMetadata, type OwnerPageContext, type OwnerPageProps } from "@/lib/workspace/page-context";
import { listCreateRecommendationSummaries } from "@/lib/workspace/queries-pages";
import { sourceLabel } from "@/lib/workspace/source-label";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: copy.en.shell.newAction.title, zh: copy["zh-HK"].shell.newAction.title });
}

/**
 * Actions › New (Phase 4): one place to start work, replacing Create, Offers
 * and the Home starter pack. "From a goal" is always there; Offer and Starter
 * pack appear only while their existing flags are on (and Offers stays off
 * for demo workspaces, as it was in More). A mode that is off falls back to
 * the goal mode, so no URL reveals a dark feature.
 */
export default async function NewActionRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const available: NewMode[] = [
    "goal",
    ...(offerPromotionsEnabled() && !page.ctx.workspace.isDemo ? (["offer"] as const) : []),
    ...(workPacksEnabled() ? (["pack"] as const) : []),
  ];
  const requested = page.query?.mode as NewMode | undefined;
  const mode: NewMode = requested && available.includes(requested) ? requested : "goal";
  const base = `/${page.locale}/owner/${page.workspaceSlug}/actions/new`;
  return (
    <>
      {available.length > 1 && <NewModeTabs locale={page.locale} base={base} location={page.locationSlug} modes={available} current={mode} />}
      {mode === "offer" ? await OffersMode(props) : mode === "pack" ? await PackMode(page) : await GoalMode(page)}
    </>
  );
}

/** Create from an objective (Phase 4 item 4 of the integration plan); the content of the old /create page. */
async function GoalMode(page: OwnerPageContext) {
  const location = page.locationSlug === "all" ? null : page.ctx.locations.find((l) => l.slug === page.locationSlug) ?? null;
  const actions = await listCreateRecommendationSummaries(page.ctx, page.locationSlug);
  const openActions = actions.map((action) => ({
    id: action.id,
    templateKey: action.templateKey,
    evidence: resolveText(action.evidence.detail, page.locale),
    freshness: resolveText(action.evidence.freshness, page.locale),
    factType: action.evidence.factType,
    source: sourceLabel(action.evidence.source, page.locale),
  }));
  return (
    <CreateView
      locale={page.locale}
      workspaceSlug={page.workspaceSlug}
      workspaceId={page.ctx.workspace.id}
      role={page.membership.role}
      inScope={inScopeFor(page.membership, location?.id ?? null)}
      location={page.locationSlug}
      locationId={location?.id ?? null}
      locations={page.locations}
      openActions={openActions}
    />
  );
}

/** The starter pack card, moved here from Today. "All" is the only location when the workspace has one. */
async function PackMode(page: OwnerPageContext) {
  const location = page.locationSlug === "all"
    ? (page.ctx.locations.length === 1 ? page.ctx.locations[0] : null)
    : page.ctx.locations.find((l) => l.slug === page.locationSlug) ?? null;
  const packs = await loadHomeWorkPacks(page.ctx, page.membership, { id: location?.id ?? null, isAll: location === null && page.ctx.locations.length > 1 });
  return packs ? <PackCard locale={page.locale} {...packs.card} /> : null;
}
