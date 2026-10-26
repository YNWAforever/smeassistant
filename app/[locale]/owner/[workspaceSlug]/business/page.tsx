import type { Metadata } from "next";
import { Activity, ArrowLeftRight, Bell, Building2, CreditCard, Images, MapPin, PlugZap, Users } from "lucide-react";

import { DestinationIndex } from "@/components/workspace/destination-index";
import { copy } from "@/lib/copy";
import { withLocation } from "@/lib/workspace/format";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: copy.en.shell.business.title, zh: copy["zh-HK"].shell.business.title });
}

/** Business: what we know about the business. Integrations stay owner-only (§3.9). */
export default async function BusinessRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const t = copy[page.locale].shell;
  const base = `/${page.locale}/owner/${page.workspaceSlug}/business`;
  const settings = `/${page.locale}/owner/${page.workspaceSlug}/settings`;
  return (
    <DestinationIndex
      title={t.business.title}
      lead={t.business.lead}
      lockedLabel={t.locked}
      links={[
        { key: "team", ...t.settings.team, icon: Users, href: withLocation(`${settings}/team`, page.locationSlug) },
        { key: "profile", ...t.business.profile, icon: Building2, href: `${base}/profile` },
        { key: "locations", ...t.business.locations, icon: MapPin, href: withLocation(`${base}/locations`, page.locationSlug) },
        { key: "assets", ...t.business.assets, icon: Images, href: withLocation(`${base}/assets`, page.locationSlug) },
        { key: "integrations", ...t.business.integrations, icon: PlugZap, href: `${base}/integrations`, locked: page.membership.role !== "owner" },
        { key: "plan", ...t.settings.plan, icon: CreditCard, href: withLocation(`${settings}/plan`, page.locationSlug) },
        { key: "notifications", ...t.settings.notifications, icon: Bell, href: withLocation(`${settings}/notifications`, page.locationSlug) },
        { key: "activity", ...t.settings.activity, icon: Activity, href: withLocation(`${settings}/activity`, page.locationSlug) },
        { key: "account", ...t.settings.account, icon: ArrowLeftRight, href: `/${page.locale}/owner/select-workspace` },
      ]}
    />
  );
}
