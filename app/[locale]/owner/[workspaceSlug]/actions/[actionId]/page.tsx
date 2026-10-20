import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActionDetailView } from "@/components/workspace/action-detail-view";
import { loadActionDetailProps } from "@/lib/workspace/action-detail-props";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Action", zh: "行動" });
}

/**
 * Action detail as a full page (deep links, phones). The Actions queue shows
 * the same detail in a side panel on wide screens (?open=id); both load it
 * through loadActionDetailProps, so the history tab renders the real audit
 * events (§3.11) of this action, its versions and its runs.
 */
export default async function ActionDetailRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const { actionId } = await props.params;
  if (!actionId) notFound();
  // P4.3: an assistant "Continue here" link carries ?version=<id>; the client ignores an id it cannot find.
  const rawVersion = (await props.searchParams)?.version;
  const detail = await loadActionDetailProps(page, actionId, (Array.isArray(rawVersion) ? rawVersion[0] : rawVersion) ?? null);
  if (!detail) notFound();
  return <ActionDetailView {...detail} />;
}
