import Link from "next/link"
import { Activity, AlertTriangle, Bell, CheckCircle2, ChevronRight, CircleDashed, Clock3, CreditCard, MapPin, Palette, PlugZap, ShieldAlert, Users, WifiOff } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { PageIntro, SectionCard } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"

export function MoreView({ locale, workspaceSlug, locationCount }: { locale: PrototypeLocale; workspaceSlug: string; locationCount: number }) {
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspaceSlug}`
  const links = [
    { en: "Locations", zh: "地點", detailEn: `${locationCount} ${locationCount === 1 ? "location" : "locations"} and comparison`, detailZh: `${locationCount} 個地點及比較`, icon: MapPin, href: `/${locale}/owner/select-workspace` },
    { en: "Activity", zh: "活動紀錄", detailEn: "Append-only decision history", detailZh: "只增不改的決定紀錄", icon: Activity, href: `${base}/activity` },
    { en: "Brand profile", zh: "品牌資料", detailEn: "Voice, claims and guardrails", detailZh: "語氣、說法及保障規則", icon: Palette, href: `${base}/settings/brand` },
    { en: "Integrations", zh: "連接與整合", detailEn: "Scope, sync and recovery", detailZh: "權限、同步及復原", icon: PlugZap, href: `${base}/settings/integrations` },
    { en: "Team & roles", zh: "團隊與角色", detailEn: "Owner, manager and viewer", detailZh: "店主、經理及檢視者", icon: Users, href: `${base}/settings/team` },
    { en: "Notifications", zh: "通知", detailEn: "Consent and quiet hours", detailZh: "同意及靜音時段", icon: Bell, href: `${base}/settings/notifications` },
    { en: "Plan & billing", zh: "方案與帳單", detailEn: "Approved deliveries and payment", detailZh: "核准後交付及付款", icon: CreditCard, href: `${base}/settings/billing` },
  ]
  const states = [
    { icon: Clock3, en: "Loading", zh: "載入中", detailEn: "Structure and labels remain stable.", detailZh: "頁面結構及標籤保持穩定。" },
    { icon: CheckCircle2, en: "Empty", zh: "沒有資料", detailEn: "No urgent work; persistent work remains.", detailZh: "沒有緊急工作；持續項目仍可查看。" },
    { icon: AlertTriangle, en: "Stale data", zh: "資料過時", detailEn: "Freshness remains explicit.", detailZh: "清楚顯示證據新鮮度。" },
    { icon: WifiOff, en: "Offline", zh: "離線", detailEn: "Approval and delivery stay blocked.", detailZh: "審批及送出保持停用。" },
    { icon: ShieldAlert, en: "Permission denied", zh: "權限不足", detailEn: "Unauthorised mutations fail closed.", detailZh: "未授權操作會安全拒絕。" },
    { icon: CircleDashed, en: "No comparable scan", zh: "暫無可比較掃描", detailEn: "No trend until eligibility is met.", detailZh: "符合資格前不顯示趨勢。" },
  ]
  return (
    <div className="more-page">
      <PageIntro eyebrow={isChinese ? "工作台管理" : "Workspace management"} title={isChinese ? "更多" : "More"} description={isChinese ? "次要設定及系統狀態不會擠入五項主要流動版導覽。" : "Secondary settings and system states stay out of the five-item primary mobile navigation."} />
      <div className="more-link-grid">{links.map(({ en, zh, detailEn, detailZh, icon: Icon, href }) => <Link key={en} href={href}><span><Icon /></span><div><h2>{isChinese ? zh : en}</h2><p>{isChinese ? detailZh : detailEn}</p></div><ChevronRight /></Link>)}</div>
      <SectionCard className="state-gallery">
        <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "可審閱的邊界狀態" : "Reviewable edge states"}</p><h2>{isChinese ? "失敗及復原也是產品的一部分" : "Failure and recovery are part of the product"}</h2></div><Badge variant="outline">{isChinese ? "6 個狀態" : "6 states"}</Badge></div>
        <div className="state-gallery-grid">{states.map(({ icon: Icon, en, zh, detailEn, detailZh }) => <article key={en}><span><Icon /></span><h3>{isChinese ? zh : en}</h3><p>{isChinese ? detailZh : detailEn}</p></article>)}</div>
      </SectionCard>
    </div>
  )
}
