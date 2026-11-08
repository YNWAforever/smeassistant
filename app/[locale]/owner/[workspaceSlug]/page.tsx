import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { normaliseLocale } from "@/lib/copy";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

import { WorkspaceHomeView } from "./home-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Today", zh: "今日焦點" });
}

/**
 * Owner entry point. With `CONVERSATION_STUDIO_ENABLED` on, the conversation is
 * the primary surface, so the root redirects there (carrying `?location=`); the
 * read-only brief moves to `/today`, which the Home tab and the brand link use.
 * Flag off keeps the previous behaviour exactly: the root renders the brief.
 */
export default async function WorkspaceHome(props: OwnerPageProps) {
  if (conversationStudioEnabled()) {
    const { locale: rawLocale, workspaceSlug } = await props.params;
    const raw = props.searchParams ? await props.searchParams : {};
    const location = Array.isArray(raw.location) ? raw.location[0] : raw.location;
    const query = location ? `?location=${encodeURIComponent(location)}` : "";
    redirect(`/${normaliseLocale(rawLocale)}/owner/${encodeURIComponent(workspaceSlug)}/studio${query}`);
  }
  const page = await loadOwnerPage(props);
  return <WorkspaceHomeView page={page} />;
}
