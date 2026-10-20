import type { Metadata } from "next";
import { Activity, Bell, CreditCard, Users } from "lucide-react";

import { DestinationIndex } from "@/components/workspace/destination-index";
import { copy } from "@/lib/copy";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: copy.en.shell.settings.title, zh: copy["zh-HK"].shell.settings.title });
}

/** Settings: who, how much, how notified. Each page keeps its own role check. */
export default async function SettingsRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const t = copy[page.locale].shell;
  const base = `/${page.locale}/owner/${page.workspaceSlug}/settings`;
  return (
    <DestinationIndex
      title={t.settings.title}
      lead={t.settings.lead}
      lockedLabel={t.locked}
      links={[
        { key: "team", ...t.settings.team, icon: Users, href: `${base}/team` },
        { key: "plan", ...t.settings.plan, icon: CreditCard, href: `${base}/plan` },
        { key: "notifications", ...t.settings.notifications, icon: Bell, href: `${base}/notifications` },
        { key: "activity", ...t.settings.activity, icon: Activity, href: `${base}/activity` },
      ]}
    />
  );
}
