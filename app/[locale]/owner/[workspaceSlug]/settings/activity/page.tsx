import type { Metadata } from "next";

import { ActivityView } from "@/components/workspace/activity-view";
import { ProblemsList } from "@/components/workspace/problems-list";
import { currentScanConsentPolicyVersion } from "@/lib/scan/consent";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { loadWorkspaceProblems } from "@/lib/workspace/problems";
import { getActivity } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Activity", zh: "活動紀錄" });
}

export default async function ActivityRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const [events, problems] = await Promise.all([
    getActivity(page.ctx),
    loadWorkspaceProblems({ workspaceId: page.ctx.workspace.id, market: page.ctx.workspace.market, membership: page.membership, tier: page.ctx.workspace.tier }),
  ]);
  return (
    <ActivityView
      locale={page.locale}
      timezone={page.ctx.workspace.timezone}
      events={events}
      problems={problems && (
        <ProblemsList
          locale={page.locale}
          workspaceSlug={page.workspaceSlug}
          workspaceId={page.ctx.workspace.id}
          tier={page.ctx.workspace.tier}
          role={page.membership.role}
          consentPolicyVersion={currentScanConsentPolicyVersion()}
          problems={problems}
        />
      )}
    />
  );
}
