import type { Metadata } from "next";

import { RoleNotice } from "@/components/states/role-notice";
import { HomeBriefView } from "@/components/workspace/home-brief";
import { NeedsAttentionCard } from "@/components/workspace/needs-attention-card";
import { filterToLocation } from "@/lib/ops/owner-actions";
import { currentScanConsentPolicyVersion } from "@/lib/scan/consent";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { loadWorkspaceProblems } from "@/lib/workspace/problems";
import { getHomeBrief } from "@/lib/workspace/queries-pages";
import { loadGettingStarted } from "@/lib/workspace/getting-started";
import { GettingStarted } from "@/components/workspace/getting-started";
import { ShopPhotoStrip, TodayProgress } from "@/components/workspace/today-progress";
import { loadTodayProgress } from "@/lib/workspace/progress-loader";
import { stockPhotosEnabled } from "@/lib/stock-photos";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Today", zh: "今日焦點" });
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
  // Effort only: tasks done this month against what is still open, in this scope.
  const today = await loadTodayProgress(page.ctx, { monthDone: brief.month.completed, open: brief.openActionCount ?? brief.openActions.length, locationId });
  const base = `/${page.locale}/owner/${page.workspaceSlug}`;
  const forbidden = page.query.forbidden === "1";
  return (
    <>
      {forbidden && <RoleNotice kind="forbidden" locale={page.locale} />}
      <HomeBriefView
        locale={page.locale}
        workspaceSlug={page.workspaceSlug}
        workspaceId={page.ctx.workspace.id}
        workspaceName={page.ctx.workspace.name}
        tier={page.ctx.workspace.tier}
        // Resolved on the server: REPORT_CONSENT_POLICY_VERSION is not
        // NEXT_PUBLIC_, so a client-side call silently returns the default and
        // any deployment carrying an override would 409 on every rescan.
        consentPolicyVersion={currentScanConsentPolicyVersion()}
        timezone={page.ctx.workspace.timezone}
        locations={page.locations}
        brief={brief}
        demo={page.ctx.workspace.isDemo}
        role={page.membership.role}
        gettingStarted={gettingStarted && <GettingStarted items={gettingStarted} locale={page.locale} />}
        progressPanel={today.progress && <TodayProgress locale={page.locale} progress={today.progress} moduleStates={brief.snapshot?.moduleStates ?? null} base={base} location={page.locationSlug} canAct={page.membership.role !== "viewer"} />}
        photoStrip={today.progress && <ShopPhotoStrip locale={page.locale} workspaceId={page.ctx.workspace.id} photos={today.photos} base={base} canUpload={page.membership.role !== "viewer"} showStock={stockPhotosEnabled()} />}
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
      />
    </>
  );
}
