import Link from "next/link"
import { Check, FileCheck2 } from "lucide-react"

import { PublicPageFrame, SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { allowanceText, type PublicBilling } from "@/lib/commercial/presentation"
import { zhDeep, zhFor } from "@/lib/zh-tw"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { formatMarketPrice, marketPricing } from "@/lib/funnel/pricing"
import { t } from "@/lib/i18n"
import { interpolate } from "@/lib/share"
import { getMarketConfig, type Market } from "@sme-scanner/region"

// No re-exports of the page components: Next ships every client component a
// server module imports, so a barrel here made each public page download the
// landing, scan, scanning, report and unlock pages. Import them directly.

export function PricingPage({ locale, market, billing }: { locale: PrototypeLocale; market: Market; billing: PublicBilling }) {
  const isChinese = locale !== "en"
  const p = copy[locale].funnel.pricing
  const f = copy[locale].funnel.landing
  const pricing = marketPricing(market)
  const growthPrice = formatMarketPrice(pricing)
  const liteAllowance = allowanceText(locale, "lite")
  const paidAllowance = allowanceText(locale, "paid")
  const notOpenLabel = t(locale, "commercial.notOpen")
  const contactHref = billing.contactHref[market]
  // Shared by the Growth card's CTA and the closing FAQ answer: the same
  // "not open yet" label, anchored to the market's contact channel when one
  // is configured, plain text otherwise (Review Focus 5).
  const notOpenNode = contactHref ? <a href={contactHref}>{notOpenLabel}</a> : notOpenLabel
  const plans = isChinese ? zhDeep(locale, [
    {
      key: "free",
      label: "一次免費掃描",
      title: copy[locale].site.pricing.freeTitle,
      price: "免費",
      cadence: "",
      description: "先看清目前的能見度、證據來源及最值得處理的問題。",
      meta: "無需登入開始",
      features: ["1 次公開證據掃描", "評分連同覆蓋率", "3 項安全優先建議", "方法、來源及限制", liteAllowance],
      cta: "免費掃描",
      href: `/${locale}/scan`,
      featured: false,
    },
    {
      key: "growth",
      label: "最適合單一地點",
      title: "增長方案",
      price: growthPrice,
      cadence: `／${f.perMonth}`,
      description: "適合希望持續改善能見度、但不想管理多個 AI 工具的小型團隊。",
      meta: "1 個地點",
      features: [paidAllowance, "可隨時自行執行的可比較重新掃描", "完整 AI 能見度團隊", "草稿版本、店主審批及成效證明"],
      cta: "開始增長方案",
      href: `/${locale}/owner/sign-in?plan=growth`,
      featured: true,
    },
    {
      key: "multi",
      label: "最多 3 個地點",
      title: "多地點方案",
      price: f.contactPricing,
      cadence: "",
      description: "讓多個分店共用一個優先次序、審批流程及能見度改善節奏。",
      meta: "包括 3 個地點",
      features: ["跨地點共用核准後交付", "跨地點優先排序", "分店範圍證據及審批", "合併進度及各地點成效"],
      cta: "管理多個地點",
      href: `/${locale}/owner/sign-in?plan=multi`,
      featured: false,
    },
    {
      key: "managed",
      label: "專人協作",
      title: "專人能見度服務",
      price: f.contactPricing,
      cadence: "",
      description: "由專人協助推進行動、品質把關及成效檢視；不是無人監管的自動發佈。",
      meta: "最短服務期 3 個月",
      features: ["顧問定期檢視及執行支援", "渠道與地點交付計劃", "同一工作台、證據及審批紀錄", "店主仍保留最終審批權"],
      cta: "了解專人服務",
      href: `/${locale}/trust`,
      featured: false,
    },
  ]) : [
    {
      key: "free", label: "One free scan", title: copy[locale].site.pricing.freeTitle, price: "Free", cadence: "", description: "See current visibility, source evidence and the best issue to tackle first.", meta: "No login to start", features: ["One public evidence scan", "Score with coverage", "Three safe priorities", "Methodology, sources and limitations", liteAllowance], cta: "Start free scan", href: `/${locale}/scan`, featured: false,
    },
    {
      key: "growth", label: "Best for one location", title: "Growth plan", price: growthPrice, cadence: ` / ${f.perMonth}`, description: "For a small team that wants recurring improvement without managing a bundle of AI tools.", meta: "1 location", features: [paidAllowance, "Comparable rescans, run whenever you choose", "Complete AI Visibility Team", "Versions, owner approval and proof"], cta: "Start Growth", href: `/${locale}/owner/sign-in?plan=growth`, featured: true,
    },
    {
      key: "multi", label: "Up to 3 locations", title: "Multi-location", price: f.contactPricing, cadence: "", description: "One priority, approval and improvement rhythm across multiple business locations.", meta: "Includes 3 locations", features: ["Approved deliveries pooled across locations", "Cross-location prioritisation", "Location-scoped evidence and approvals", "Combined and per-location outcomes"], cta: "Manage multiple locations", href: `/${locale}/owner/sign-in?plan=multi`, featured: false,
    },
    {
      key: "managed", label: "Human-managed", title: "Managed Visibility", price: f.contactPricing, cadence: "", description: "Human execution, quality review and outcome support—not unattended auto-publishing.", meta: "3-month minimum", features: ["Consultant review and execution support", "Channel and location delivery plan", "The same workspace and audit trail", "Owner keeps final approval"], cta: "Learn about managed service", href: `/${locale}/trust`, featured: false,
    },
  ]
  return (
    <PublicPageFrame locale={locale}>
      <main className="content-page pricing-page">
        <header className="content-page-intro"><Badge variant="outline">{p.badge}</Badge><h1>{isChinese ? "不是一堆 AI 工具，而是一隊替你推進改善的團隊。" : "Not a bundle of AI tools. One team that moves improvement forward."}</h1><p>{isChinese ? zhFor(locale, "由一次免費證據掃描開始；需要持續監察、草稿與審批時升級工作台，多地點或需要專人支援時再按業務規模擴展。") : "Start with a free evidence scan, add a workspace for recurring monitoring and approvals, then scale by locations or add human-managed support."}</p><p>{interpolate(p.marketNote, { currency: pricing.currency, market: locale === "en" ? getMarketConfig(market).geoLabelEn : getMarketConfig(market).geoLabelZh })}</p></header>
        <div className="pricing-grid">
          {plans.map((plan) => <SectionCard key={plan.key} className={`pricing-card ${plan.featured ? "pricing-featured" : ""}`}>
            {plan.featured && <div className="recommended-label">{isChinese ? "推薦起點" : "Recommended start"}</div>}
            <div className="pricing-card-head"><div><Badge variant={plan.featured ? "default" : "outline"}>{plan.label}</Badge><h2>{plan.title}</h2></div><span className={`price ${plan.key === "free" ? "price-text" : ""}`}>{plan.price}{plan.cadence && <small>{plan.cadence}</small>}</span></div>
            <p>{plan.description}</p>
            <strong className="plan-meta">{plan.meta}</strong>
            <ul className="check-list">{plan.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul>
            {plan.key === "growth" && !billing.open ? (
              <p className="limitation-note">{notOpenNode}</p>
            ) : (
              <Button asChild variant={plan.featured ? "default" : "outline"} className="w-full"><Link href={plan.href}>{plan.cta}</Link></Button>
            )}
          </SectionCard>)}
        </div>
        <p className="plan-test-note">{billing.open ? p.planNote : f.planNote}</p>
        <SectionCard className="pricing-usage-banner"><FileCheck2 /><div><p className="eyebrow">{isChinese ? "核准後交付，不是代幣" : "Approved deliveries, not tokens"}</p><h2>{isChinese ? "只有指定版本獲核准並首次成功匯出或發佈，才計 1 次交付。" : "One delivery is counted only after an exact version is approved and first exported or published."}</h2><p>{isChinese ? zhFor(locale, "查看證據、優先排序、重新掃描、生成、修改、退回、拒絕或執行失敗都不扣除用量。所有 Workspace 方案都包括安全檢查、店主審批、活動紀錄及可還原路徑。") : "Evidence, prioritisation, rescans, generation, revisions, returns, rejections and failed runs use no allowance. Safety checks, owner approval, activity history and recovery are included in every Workspace plan."}</p></div></SectionCard>
        <SectionCard className="pricing-faq"><div><p className="eyebrow">{isChinese ? "簡單選擇" : "Simple choices"}</p><h2>{isChinese ? "我應選哪個方案？" : "Which plan fits?"}</h2><p>{isChinese ? zhFor(locale, "先免費掃描。單一地點可由增長方案開始；第 2 或第 3 個地點出現時才考慮多地點。需要專人推進時，再選專人服務。") : "Start free. Choose Growth for one location, Multi-location when a second or third location appears, and Managed when you need human execution."}</p></div><div><h3>{isChinese ? "內容會自動發佈嗎？" : "Will content auto-publish?"}</h3><p>{isChinese ? zhFor(locale, "不會。每次匯出或發佈前都需要正確權限及明確店主審批；專人服務亦不例外。") : "No. Every export or publish step requires the right permission and an explicit owner approval, including Managed Visibility."}</p></div><div><h3>{p.faqFinalTitle}</h3><p>{billing.open ? p.faqFinalBody : notOpenNode}</p></div></SectionCard>
      </main>
    </PublicPageFrame>
  )
}
