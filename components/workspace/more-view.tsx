import Link from "next/link"
import { Activity, Bell, CalendarDays, ChevronRight, CreditCard, Layers3, MapPin, Palette, PlugZap, Tag, Users } from "lucide-react"

import { PageIntro } from "@/components/product-ui"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { withLocation } from "@/lib/workspace/format"
import { zhFor } from "@/lib/zh-tw"

export function MoreView({ locale, workspaceSlug, locationCount, locationSlug, offersEnabled = false }: { locale: PrototypeLocale; workspaceSlug: string; locationCount: number; locationSlug: string; offersEnabled?: boolean }) {
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspaceSlug}`
  const focus = copy[locale].ownerFocus
  const links = [
    { group: "settings", en: "Locations", zh: "地點", detailEn: `${locationCount} ${locationCount === 1 ? "location" : "locations"} and comparison`, detailZh: `${locationCount} 個地點及比較`, icon: MapPin, href: `/${locale}/owner/select-workspace` },
    { group: "content", en: "Brand assets", zh: "品牌素材", detailEn: "Approved photos, menus and usage rights", detailZh: "已核准相片、餐牌及使用權", icon: Layers3, href: withLocation(`${base}/assets`, locationSlug) },
    // The destination exists only when the offers feature is enabled.
    ...(offersEnabled ? [{ group: "content", en: copy.en.workspace.offers.nav, zh: copy[locale].workspace.offers.nav, detailEn: copy.en.workspace.offers.page.eyebrow, detailZh: copy[locale].workspace.offers.page.eyebrow, icon: Tag, href: withLocation(`${base}/offers`, locationSlug) }] : []),
    { group: "history", en: "Calendar", zh: "日曆", detailEn: "Rescan cadence and dated work", detailZh: "重新掃描節奏及有到期日的工作", icon: CalendarDays, href: `${base}/calendar` },
    { group: "history", en: "Activity", zh: "活動紀錄", detailEn: "Your decisions and completed work", detailZh: "查看決定及已完成的工作", icon: Activity, href: `${base}/activity` },
    { group: "content", en: "Brand profile", zh: "品牌資料", detailEn: "Voice and confirmed business facts", detailZh: "品牌語氣及已確認的商戶資料", icon: Palette, href: `${base}/settings/brand` },
    { group: "settings", en: "Integrations", zh: "連接與整合", detailEn: "Connect or check your data sources", detailZh: "連接或檢查資料來源", icon: PlugZap, href: `${base}/settings/integrations` },
    { group: "settings", en: "Team & roles", zh: "團隊與權限", detailEn: "Manage your team and access", detailZh: "管理同事及存取權限", icon: Users, href: `${base}/settings/team` },
    { group: "settings", en: "Notifications", zh: "通知", detailEn: "Choose which updates to receive", detailZh: "選擇接收哪些更新", icon: Bell, href: `${base}/settings/notifications` },
    { group: "settings", en: "Plan & billing", zh: "方案與帳單", detailEn: "Usage, plan and payment", detailZh: "用量、方案及付款", icon: CreditCard, href: `${base}/settings/billing` },
  ]
  const groups = [
    { key: "content", title: focus.contentGroup },
    { key: "history", title: focus.historyGroup },
    { key: "settings", title: focus.settingsGroup },
  ]
  return (
    <div className="more-page owner-more-page">
      <PageIntro eyebrow={isChinese ? "工作台管理" : "Workspace management"} title={copy[locale].nav.more} description={focus.moreIntro} />
      {groups.map(group => <section className="owner-more-group" key={group.key} aria-labelledby={`more-${group.key}`}>
        <h2 id={`more-${group.key}`}>{group.title}</h2>
        <div className="more-link-grid">{links.filter(link => link.group === group.key).map(({ en, zh, detailEn, detailZh, icon: Icon, href }) => <Link key={en} href={href}><span><Icon aria-hidden="true" /></span><div><h3>{isChinese ? zhFor(locale, zh) : en}</h3><p>{isChinese ? zhFor(locale, detailZh) : detailEn}</p></div><ChevronRight aria-hidden="true" /></Link>)}</div>
      </section>)}
    </div>
  )
}
