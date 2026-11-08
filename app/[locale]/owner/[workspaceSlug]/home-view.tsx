import { TriangleAlert } from "lucide-react";

import { HomeBriefView } from "@/components/workspace/home-brief";
import { NeedsAttentionCard } from "@/components/workspace/needs-attention-card";
import { filterToLocation } from "@/lib/ops/owner-actions";
import { currentScanConsentPolicyVersion } from "@/lib/scan/consent";
import type { OwnerPageContext } from "@/lib/workspace/page-context";
import { loadHomeWorkPacks } from "@/lib/workspace/packs";
import { loadWorkspaceProblems } from "@/lib/workspace/problems";
import { getHomeBrief } from "@/lib/workspace/queries-pages";
import { zhFor } from "@/lib/zh-tw";

/**
 * The read-only "Today" brief, shared by the workspace root (flag off) and the
 * /today route (flag on). Extracted from the root page so the Conversation
 * Studio can own the root while the brief stays reachable from the Home tab;
 * the data loading, copy and cards are unchanged.
 */
export async function WorkspaceHomeView({ page }: { page: OwnerPageContext }) {
  // P4.2: undefined, with no SQL, while WORK_PACKS_ENABLED is off. "All" is a single
  // location's pack when the workspace has only one; with several there is none to start for.
  const homeLocation = page.locationSlug === "all" ? (page.ctx.locations.length === 1 ? page.ctx.locations[0] : null) : page.ctx.locations.find((l) => l.slug === page.locationSlug) ?? null;
  const [brief, problems, workPacks] = await Promise.all([
    getHomeBrief(page.ctx, page.locationSlug),
    loadWorkspaceProblems({
      workspaceId: page.ctx.workspace.id,
      market: page.ctx.workspace.market,
      membership: page.membership,
      tier: page.ctx.workspace.tier,
    }),
    loadHomeWorkPacks(page.ctx, page.membership, { id: homeLocation?.id ?? null, isAll: homeLocation === null && page.ctx.locations.length > 1 }),
  ]);
  const locationId = page.locationSlug === "all" ? "all" : page.ctx.locations.find((l) => l.slug === page.locationSlug)?.id ?? "all";
  const forbidden = page.query.forbidden === "1";
  return (
    <>
      {forbidden && <div className="permission-note" role="alert"><TriangleAlert /><span>{page.isChinese ? zhFor(page.locale, "你的角色或地點範圍不允許該操作，已返回工作台首頁。") : "Your role or location scope does not allow that action; you have been returned to the workspace home."}</span></div>}
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
        fixPack={{ workspaceId: page.ctx.workspace.id, role: page.membership.role }}
        workPacks={workPacks}
        role={page.membership.role}
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
