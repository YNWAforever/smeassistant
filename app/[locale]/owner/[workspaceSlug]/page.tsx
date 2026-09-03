import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { HomeBriefView } from "@/components/workspace/home-brief";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getHomeBrief } from "@/lib/workspace/queries-pages";

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
  const brief = await getHomeBrief(page.ctx, page.locationSlug);
  const forbidden = page.query.forbidden === "1";
  return (
    <>
      {forbidden && <div className="permission-note" role="alert"><TriangleAlert /><span>{page.isChinese ? "你的角色或地點範圍不允許該操作，已返回工作台首頁。" : "Your role or location scope does not allow that action; you have been returned to the workspace home."}</span></div>}
      <HomeBriefView
        locale={page.locale}
        workspaceSlug={page.workspaceSlug}
        workspaceId={page.ctx.workspace.id}
        workspaceName={page.ctx.workspace.name}
        tier={page.ctx.workspace.tier}
        timezone={page.ctx.workspace.timezone}
        locations={page.locations}
        brief={brief}
        demo={page.ctx.workspace.isDemo}
        fixPack={{ workspaceId: page.ctx.workspace.id, role: page.membership.role }}
      />
    </>
  );
}
