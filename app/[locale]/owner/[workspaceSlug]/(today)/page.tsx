import type { Metadata } from "next";

import { RoleNotice } from "@/components/states/role-notice";
import { GettingStarted } from "@/components/workspace/getting-started";
import { HomeFollowUps } from "@/components/workspace/home/home-follow-ups";
import { HomeView } from "@/components/workspace/home/home-view";
import { NeedsAttentionCard } from "@/components/workspace/needs-attention-card";
import { filterToLocation } from "@/lib/ops/owner-actions";
import { currentScanConsentPolicyVersion } from "@/lib/scan/consent";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { loadWorkspaceProblems } from "@/lib/workspace/problems";
import { getHomeBrief } from "@/lib/workspace/queries-pages";
import { loadGettingStarted } from "@/lib/workspace/getting-started";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Today", zh: "今日" });
}

/**
 * Owner Home (CLAUDE.md §3.5.5, §5 "Owner Home"): every card is bound to the
 * home brief for the scoped location. `?location=all` never aggregates a
 * score; it lists actions across locations instead.
 */
export default async function WorkspaceHome(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const [brief, problems, gettingStarted] = await Promise.all([
    getHomeBrief(page.ctx, page.locationSlug),
    loadWorkspaceProblems({
      workspaceId: page.ctx.workspace.id,
      market: page.ctx.workspace.market,
      membership: page.membership,
      tier: page.ctx.workspace.tier,
    }),
    loadGettingStarted(page.ctx, page.membership, page.locale),
  ]);
  const locationId = page.locationSlug === "all" ? "all" : page.ctx.locations.find((l) => l.slug === page.locationSlug)?.id ?? "all";
  const forbidden = page.query.forbidden === "1";
  return (
    <>
      {forbidden && <RoleNotice kind="forbidden" locale={page.locale} />}
      <HomeView
        locale={page.locale}
        workspaceSlug={page.workspaceSlug}
        timezone={page.ctx.workspace.timezone}
        locations={page.locations}
        brief={brief}
        role={page.membership.role}
        followUps={<HomeFollowUps locale={page.locale} workspaceSlug={page.workspaceSlug} workspaceId={page.ctx.workspace.id} location={page.locationSlug} brief={brief} role={page.membership.role} />}
        problems={problems && (
          <NeedsAttentionCard
            locale={page.locale}
            workspaceSlug={page.workspaceSlug}
            workspaceId={page.ctx.workspace.id}
            tier={page.ctx.workspace.tier}
            role={page.membership.role}
            consentPolicyVersion={currentScanConsentPolicyVersion()}
            problems={filterToLocation(problems, locationId)}
          />
        )}
        gettingStarted={!brief.priority && gettingStarted && <GettingStarted items={gettingStarted} locale={page.locale} />}
      />
    </>
  );
}
