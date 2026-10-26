import type { Metadata } from "next";
import { Activity, ArrowLeftRight, Bell, Building2, CreditCard, Images, MapPin, PlugZap, Users } from "lucide-react";

import { DestinationIndex } from "@/components/workspace/destination-index";
import { ShopProfileCard } from "@/components/workspace/today-progress";
import { loadShopProfile } from "@/lib/workspace/progress-loader";
import { stockPhotosEnabled } from "@/lib/stock-photos";
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
  const shop = await loadShopProfile(page.ctx);
  const owner = page.membership.role === "owner";
  // Each unfinished item links where it is filled in, only where this role may go.
  const profileLinks = owner ? {
    voice: `${base}/profile`, facts: `${base}/profile`, claims: `${base}/profile`,
    photo: withLocation(`${base}/assets`, page.locationSlug), google: `${base}/integrations`, instagram: `${base}/integrations`,
  } : page.membership.role === "manager" ? { photo: withLocation(`${base}/assets`, page.locationSlug) } : {};
  return (
    <DestinationIndex
      title={t.business.title}
      lead={t.business.lead}
      lockedLabel={t.locked}
      header={shop && <ShopProfileCard locale={page.locale} profile={shop.profile} photo={shop.photo} links={profileLinks} showStock={stockPhotosEnabled()} />}
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
