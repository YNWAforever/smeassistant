import type { Metadata } from "next";

import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

import { WorkspaceHomeView } from "../home-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Today", zh: "今日焦點" });
}

/**
 * The read-only "Today" brief. It is the workspace root while the Conversation
 * Studio flag is off; with the flag on the root redirects to the Studio and the
 * Home tab points here, so the brief is still one click away.
 */
export default async function WorkspaceToday(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  return <WorkspaceHomeView page={page} />;
}
