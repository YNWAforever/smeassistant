import type { Metadata } from "next";

import { TeamView } from "@/components/workspace/team-view";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getTeam } from "@/lib/workspace/team";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Team & permissions", zh: "團隊與權限" });
}

/**
 * Any member may see who is on the team (§3.9: managers and viewers see the
 * read-only table behind the permission banner); only owners get the invite,
 * role, scope and remove controls, and the members routes enforce the same rule.
 */
export default async function TeamRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const model = await getTeam(page.ctx);
  return <TeamView locale={page.locale} workspaceId={page.ctx.workspace.id} role={page.membership.role} timezone={page.ctx.workspace.timezone} model={model} />;
}
