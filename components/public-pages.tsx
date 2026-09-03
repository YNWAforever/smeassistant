import Link from "next/link"
import {
  ArrowRight,
  Building2,
  Check,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  MapPin,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
} from "lucide-react"

import { DemoBadge, FactType, ProviderBadge, PublicPageFrame, SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { formatMarketPrice, marketPricing } from "@/lib/funnel/pricing"
import { interpolate } from "@/lib/share"
import { getMarketConfig, type Market } from "@sme-scanner/region"
import type { ScoreResult } from "@sme-scanner/scoring"

export { LandingPage } from "@/components/landing-page"
export { ReportPage } from "@/components/report-view"
export { ScanPage } from "@/components/scan-page"
export { ScanningPage } from "@/components/scanning-page"
export { UnlockPage } from "@/components/unlock-page"

/** Pinned to the scorer both apps run (CLAUDE.md guardrail 16); a bump upstream breaks this line. */
const SCORING_VERSION: ScoreResult["scoringVersion"] = "2026-08-16"

export function PricingPage({ locale, market }: { locale: PrototypeLocale; market: Market }) {
  const isChinese = locale !== "en"
  const p = copy[locale].funnel.pricing
  const f = copy[locale].funnel.landing
  const pricing = marketPricing(market)
  const growthPrice = formatMarketPrice(pricing)
  const plans = isChinese ? [
    {
      key: "free",
      label: "一次免費掃描",
      title: "SME Scanner",
      price: "免費",
      cadence: "",
      description: "先看清目前的能見度、證據來源及最值得處理的問題。",
      meta: "無需登入開始",
      features: ["1 次公開證據掃描", "評分連同覆蓋率", "3 項安全優先建議", "方法、來源及限制"],
      cta: "免費掃描",
      href: `/${locale}/scan`,
      featured: false,
    },
    {
      key: "growth",
      label: "最適合單一地點",
      title: "增長工作台",
      price: growthPrice,
      cadence: `／${f.perMonth}`,
      description: "適合希望持續改善能見度、但不想管理多個 AI 工具的小型團隊。",
      meta: "1 個地點 · 2 位用戶",
      features: ["每月 12 次核准後交付", "定期可比較重新掃描", "完整 AI 能見度團隊", "草稿版本、店主審批及成效證明"],
      cta: "開始增長工作台",
      href: `/${locale}/owner/sign-in?plan=growth`,
      featured: true,
    },
    {
      key: "multi",
      label: "最多 3 個地點",
      title: "多地點工作台",
      price: f.contactPricing,
      cadence: "",
      description: "讓多個分店共用一個優先次序、審批流程及能見度改善節奏。",
      meta: "包括 3 個地點",
      features: ["每月共用 36 次核准後交付", "跨地點優先排序", "分店範圍證據及審批", "合併進度及各地點成效"],
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
  ] : [
    {
      key: "free", label: "One free scan", title: "SME Scanner", price: "Free", cadence: "", description: "See current visibility, source evidence and the best issue to tackle first.", meta: "No login to start", features: ["One public evidence scan", "Score with coverage", "Three safe priorities", "Methodology, sources and limitations"], cta: "Start free scan", href: `/${locale}/scan`, featured: false,
    },
    {
      key: "growth", label: "Best for one location", title: "Growth Workspace", price: growthPrice, cadence: ` / ${f.perMonth}`, description: "For a small team that wants recurring improvement without managing a bundle of AI tools.", meta: "1 location · 2 users", features: ["12 approved deliveries per month", "Scheduled comparable rescans", "Complete AI Visibility Team", "Versions, owner approval and proof"], cta: "Start Growth", href: `/${locale}/owner/sign-in?plan=growth`, featured: true,
    },
    {
      key: "multi", label: "Up to 3 locations", title: "Multi-location", price: f.contactPricing, cadence: "", description: "One priority, approval and improvement rhythm across multiple business locations.", meta: "Includes 3 locations", features: ["36 pooled approved deliveries per month", "Cross-location prioritisation", "Location-scoped evidence and approvals", "Combined and per-location outcomes"], cta: "Manage multiple locations", href: `/${locale}/owner/sign-in?plan=multi`, featured: false,
    },
    {
      key: "managed", label: "Human-managed", title: "Managed Visibility", price: f.contactPricing, cadence: "", description: "Human execution, quality review and outcome support—not unattended auto-publishing.", meta: "3-month minimum", features: ["Consultant review and execution support", "Channel and location delivery plan", "The same workspace and audit trail", "Owner keeps final approval"], cta: "Learn about managed service", href: `/${locale}/trust`, featured: false,
    },
  ]
  return (
    <PublicPageFrame locale={locale}>
      <main className="content-page pricing-page">
        <header className="content-page-intro"><Badge variant="outline">{p.badge}</Badge><h1>{isChinese ? "不是一堆 AI 工具，而是一隊替你推進改善的團隊。" : "Not a bundle of AI tools. One team that moves improvement forward."}</h1><p>{isChinese ? "由一次免費證據掃描開始；需要持續監察、草稿與審批時升級工作台，多地點或需要專人支援時再按業務規模擴展。" : "Start with a free evidence scan, add a workspace for recurring monitoring and approvals, then scale by locations or add human-managed support."}</p><p>{interpolate(p.marketNote, { currency: pricing.currency, market: locale === "en" ? getMarketConfig(market).geoLabelEn : getMarketConfig(market).geoLabelZh })}</p></header>
        <div className="pricing-grid">
          {plans.map((plan) => <SectionCard key={plan.key} className={`pricing-card ${plan.featured ? "pricing-featured" : ""}`}>
            {plan.featured && <div className="recommended-label">{isChinese ? "推薦起點" : "Recommended start"}</div>}
            <div className="pricing-card-head"><div><Badge variant={plan.featured ? "default" : "outline"}>{plan.label}</Badge><h2>{plan.title}</h2></div><span className={`price ${plan.key === "free" ? "price-text" : ""}`}>{plan.price}{plan.cadence && <small>{plan.cadence}</small>}</span></div>
            <p>{plan.description}</p>
            <strong className="plan-meta">{plan.meta}</strong>
            <ul className="check-list">{plan.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul>
            <Button asChild variant={plan.featured ? "default" : "outline"} className="w-full"><Link href={plan.href}>{plan.cta}</Link></Button>
          </SectionCard>)}
        </div>
        <p className="plan-test-note">{p.planNote}</p>
        <SectionCard className="pricing-usage-banner"><FileCheck2 /><div><p className="eyebrow">{isChinese ? "核准後交付，不是代幣" : "Approved deliveries, not tokens"}</p><h2>{isChinese ? "只有指定版本獲核准並首次成功匯出或發佈，才計 1 次交付。" : "One delivery is counted only after an exact version is approved and first exported or published."}</h2><p>{isChinese ? "查看證據、優先排序、重新掃描、生成、修改、退回、拒絕或執行失敗都不扣除用量。所有 Workspace 方案都包括安全檢查、店主審批、活動紀錄及可還原路徑。" : "Evidence, prioritisation, rescans, generation, revisions, returns, rejections and failed runs use no allowance. Safety checks, owner approval, activity history and recovery are included in every Workspace plan."}</p></div></SectionCard>
        <SectionCard className="pricing-faq"><div><p className="eyebrow">{isChinese ? "簡單選擇" : "Simple choices"}</p><h2>{isChinese ? "我應選哪個方案？" : "Which plan fits?"}</h2><p>{isChinese ? "先免費掃描。單一地點可由增長工作台開始；第 2 或第 3 個地點出現時才考慮多地點。需要專人推進時，再選專人服務。" : "Start free. Choose Growth for one location, Multi-location when a second or third location appears, and Managed when you need human execution."}</p></div><div><h3>{isChinese ? "內容會自動發佈嗎？" : "Will content auto-publish?"}</h3><p>{isChinese ? "不會。每次匯出或發佈前都需要正確權限及明確店主審批；專人服務亦不例外。" : "No. Every export or publish step requires the right permission and an explicit owner approval, including Managed Visibility."}</p></div><div><h3>{p.faqFinalTitle}</h3><p>{p.faqFinalBody}</p></div></SectionCard>
      </main>
    </PublicPageFrame>
  )
}

export function MethodologyPage({ locale }: { locale: PrototypeLocale }) {
  const isChinese = locale !== "en"
  return (
    <PublicPageFrame locale={locale}>
      <main className="content-page methodology-page">
        <header className="content-page-intro"><Badge variant="outline">{interpolate(copy[locale].funnel.methodology.versionBadge, { version: SCORING_VERSION })}</Badge><h1>{isChinese ? "如何處理證據、覆蓋範圍及可比較變化" : "How evidence, coverage and comparable change are handled"}</h1><p>{isChinese ? "評分只協助作決定，不是收入證明，亦不能取代原始證據。" : "The score is a decision aid, not proof of revenue or a substitute for the source evidence."}</p></header>
        <section className="method-principles"><article><span>01</span><h2>{isChinese ? "先有證據，後有評分" : "Evidence before score"}</h2><p>{isChinese ? "每項發現由可觀察來源開始，並保留市場或搜尋脈絡、時間、來源狀態、量度值及安全證據參考。" : "Every finding begins with an observable source, market or query context, timestamp, provider state, measured value and a safe evidence reference."}</p></article><article><span>02</span><h2>{isChinese ? "先看覆蓋，再作比較" : "Coverage before comparison"}</h2><p>{isChinese ? "已量度、未能取得、未支援及失敗互不相同。缺少證據會排除，不會靜默轉成零分。" : "Measured, unavailable, unsupported and failed are distinct. Missing evidence is excluded—not silently converted to zero."}</p></article><article><span>03</span><h2>{isChinese ? "可以比較，才談變化" : "Comparable before change"}</h2><p>{isChinese ? "只有相關證據及市場脈絡符合資格規則，兩次掃描才會比較。" : "Two scans are compared only when the relevant evidence and market context meet the eligibility rule."}</p></article></section>
        <div className="method-layout"><SectionCard><p className="eyebrow">{isChinese ? "目前可支援的版面" : "Currently supportable surfaces"}</p><h2>{isChinese ? "產品可以如實命名的範圍" : "What the product may name"}</h2><ul className="evidence-list"><li><Badge variant="outline">{isChinese ? "已支援" : "Supported"}</Badge><span><strong>{isChinese ? "Google 搜尋與地圖" : "Google Search and Maps"}</strong><small>{isChinese ? "支援自然、本地及商戶實體證據。" : "Supported organic, local and entity evidence."}</small></span></li><li><Badge variant="outline">{isChinese ? "有條件支援" : "Supported · conditional"}</Badge><span><strong>Google AI Overview and AI Mode</strong><small>{isChinese ? "只在支援的搜尋字詞出現相關版面時量度。" : "Only when those surfaces appear for the supported query."}</small></span></li><li><Badge variant="outline">{isChinese ? "已支援 · 覆蓋因來源而異" : "Supported · coverage varies"}</Badge><span><strong>{isChinese ? "Instagram 與公開網站" : "Instagram and public website"}</strong><small>{isChinese ? "視乎來源及公開頁面可用性。" : "Subject to provider and public-page availability."}</small></span></li><li><ProviderBadge state="unsupported" locale={locale} /><span><strong>ChatGPT and Perplexity probes</strong><small>{isChinese ? "未有可重現的第一方證據前不作支援聲稱。" : "Not claimed until reproducible first-party evidence exists."}</small></span></li></ul></SectionCard><SectionCard><p className="eyebrow">{isChinese ? "解讀合約" : "Interpretation contract"}</p><h2>{isChinese ? "6 個標籤避免虛假肯定" : "Six labels prevent false certainty"}</h2><div className="fact-definition-list"><div><FactType type="Observed" /><p>{isChinese ? "直接量度的證據。" : "Directly measured evidence."}</p></div><div><FactType type="Inference" /><p>{isChinese ? "根據證據及規則作出的解讀。" : "A rule-based interpretation of the evidence."}</p></div><div><FactType type="Recommended" /><p>{isChinese ? "建議的業務行動。" : "A proposed business action."}</p></div><div><FactType type="Attributed" /><p>{isChinese ? "後續變化可能與行動相關，方法會列明。" : "A later change plausibly linked to an action, with method stated."}</p></div><div><FactType type="Estimated" /><p>{isChinese ? "保留假設的模型估算。" : "A modelled result whose assumptions remain visible."}</p></div><div><FactType type="Unknown" /><p>{isChinese ? "證據不足或不能比較。" : "Evidence is insufficient or incomparable."}</p></div></div></SectionCard></div>
        <SectionCard className="formula-card"><div><p className="eyebrow">{isChinese ? "兼顧覆蓋率的評分" : "Coverage-aware scoring"}</p><h2>{isChinese ? "評分 = 已量度訊號加權值 ÷ 合資格已量度權重" : "Score = weighted measured signals ÷ eligible measured weight"}</h2><p>{isChinese ? "未能取得或未支援的模組會降低覆蓋率，但不會降低評分。量度證據太少時，評分可以暫不顯示。" : "Unavailable or unsupported modules reduce coverage. They do not reduce the score. A score may be withheld when too little evidence is measured."}</p></div><div className="formula-example"><span>{isChinese ? "例子" : "Example"}</span><strong>{isChinese ? "評分 62" : "62 score"}</strong><small>{isChinese ? "覆蓋率 78% · 4 個主要來源中量度 3 個" : "78% coverage · 3 of 4 primary sources"}</small></div></SectionCard>
        <div className="limitations-box"><TriangleAlert /><div><h2>{isChinese ? "限制" : "Limitations"}</h2><p>{isChinese ? "結果會因搜尋字詞、地點、語言、裝置、來源可用性及觀察時間而異。能見度變化不能證明收入、預訂或顧客意向有變。" : "Results can vary by query, location, language, device, provider availability and observation time. Visibility movement does not prove changes in revenue, reservations or customer intent."}</p></div></div>
      </main>
    </PublicPageFrame>
  )
}

export function TrustPage({ locale }: { locale: PrototypeLocale }) {
  const isChinese = locale !== "en"
  const tr = copy[locale].funnel.trust
  const pillars = isChinese ? [
    { icon: ShieldCheck, title: "設計上保護證據", body: "公開預覽排除店主專屬資料、來源原始載荷及內部識別碼。" },
    { icon: UserCheck, title: "人工審批是界線", body: "已生成工作仍是草稿，直至獲授權人士批准一個不可變版本。" },
    { icon: LockKeyhole, title: "伺服器強制執行範圍", body: "正式變更必須驗證角色、工作台、地點、權益及整合權限。" },
    { icon: FileCheck2, title: "只追加的責任紀錄", body: "行動、編輯、決定及送達嘗試都會建立限定範圍的審計事件。" },
  ] : [
    { icon: ShieldCheck, title: "Evidence-safe by design", body: "Public previews exclude owner-only details, raw provider payloads and internal identifiers." },
    { icon: UserCheck, title: "Human approval is a boundary", body: "Generated work remains a draft until an authorised person approves one immutable version." },
    { icon: LockKeyhole, title: "Server-enforced scope", body: "Production mutations must verify role, workspace, location, entitlement and integration permission." },
    { icon: FileCheck2, title: "Append-only accountability", body: "Actions, edits, decisions and delivery attempts create a scoped audit event." },
  ]
  return (
    <PublicPageFrame locale={locale}>
      <main className="content-page trust-page">
        <header className="content-page-intro"><Badge variant="outline">{isChinese ? "安全、私隱與人工控制" : "Security, privacy and human control"}</Badge><h1>{isChinese ? "一個身份、一條權限界線、一份審計紀錄" : "One identity, one permission boundary, one audit trail"}</h1><p>{tr.intro}</p></header>
        <div className="trust-pillar-grid">{pillars.map(({ icon: Icon, title, body }) => <article key={title}><span><Icon /></span><h2>{title}</h2><p>{body}</p></article>)}</div>
        <div className="method-layout"><SectionCard><p className="eyebrow">{isChinese ? "審批合約" : "Approval contract"}</p><h2>{isChinese ? "對外送達是獨立狀態轉換" : "External delivery is a separate transition"}</h2><ol className="number-list"><li><span>1</span><div><strong>{isChinese ? "準備" : "Prepare"}</strong><p>{isChinese ? "輸入按範圍限制，不受信任內容只會當成資料，不會當成指令。" : "Inputs are scoped and untrusted content is treated as data, not instruction."}</p></div></li><li><span>2</span><div><strong>{isChinese ? "審閱一個版本" : "Review a version"}</strong><p>{isChinese ? "編輯已批准版本會建立新草稿並重設審批。" : "Editing an approved version creates a new draft and resets approval."}</p></div></li><li><span>3</span><div><strong>{isChinese ? "確認目標" : "Confirm the target"}</strong><p>{isChinese ? "送達需要獲授權角色、正確連接範圍、冪等處理及可復原失敗路徑。" : "Delivery requires an authorised role, connected scope, idempotency and recoverable failure handling."}</p></div></li></ol></SectionCard><SectionCard><p className="eyebrow">{tr.boundaryEyebrow}</p><h2>{tr.boundaryTitle}</h2><dl className="trust-dl">{tr.rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl><Link href={`/${locale}/legal/privacy`}>{tr.policyLink}</Link></SectionCard></div>
        <SectionCard className="retention-summary"><div><ShieldCheck /><div><h2>{isChinese ? "資料保留與刪除仍屬正式產品合約" : "Retention and deletion remain production contracts"}</h2><p>{isChinese ? "掃描證據、Agent 輸入與輸出、素材、審計事件、OAuth 代幣及帳單紀錄需要各自的用途、保留、存取與刪除規則。未有明確合約同意前，客戶資料不會用於模型訓練。" : "Scan evidence, agent inputs and outputs, assets, audit events, OAuth tokens and billing records need separate purpose, retention, access and deletion rules. Customer data is not used for model training without explicit contractual consent."}</p></div></div><Button asChild variant="outline"><Link href={`/${locale}/methodology`}>{isChinese ? "查看量度限制" : "Read measurement limitations"}</Link></Button></SectionCard>
      </main>
    </PublicPageFrame>
  )
}

export function SignInPage({ locale, signInHref, plan }: { locale: PrototypeLocale; signInHref?: string; plan?: string }) {
  const isChinese = locale !== "en"
  const planLabel = plan === "multi" ? (isChinese ? "多地點工作台" : "Multi-location") : plan === "growth" ? (isChinese ? "增長工作台" : "Growth Workspace") : null
  return (
    <PublicPageFrame locale={locale}>
      <main className="auth-page">
        <section className="auth-value"><Badge variant="outline">Visibility Workspace</Badge><h1>{isChinese ? "安全返回需要你決定的業務行動" : "Return securely to the business action that needs you"}</h1><p>{isChinese ? "公開掃描與店主工作台分開。登入後，系統會保留原本的方案、工作台、地點及行動脈絡。" : "Public scanning and the owner workspace stay separate. Sign-in preserves the selected plan, workspace, location and action context."}</p><div className="auth-proof-list"><div><KeyRound /><span><strong>{isChinese ? "使用 ChatGPT 安全登入" : "Secure ChatGPT sign-in"}</strong><small>{isChinese ? "不在此原型收集密碼" : "No password is collected by this prototype"}</small></span></div><div><Building2 /><span><strong>{isChinese ? "工作台與地點範圍" : "Workspace and location scope"}</strong><small>{isChinese ? "每次受保護頁面都重新驗證" : "Re-checked on protected routes"}</small></span></div><div><ShieldCheck /><span><strong>{isChinese ? "按角色限制決定" : "Role-aware decisions"}</strong><small>{isChinese ? "審批與匯出仍需正確權限" : "Approval and export still require the right authority"}</small></span></div></div></section>
        <section className="auth-card"><DemoBadge locale={locale} />{planLabel && <Badge variant="outline">{isChinese ? "已選方案" : "Selected plan"} · {planLabel}</Badge>}<h2>{isChinese ? "店主安全登入" : "Secure owner sign in"}</h2><p>{isChinese ? "這個私人審閱版本使用 ChatGPT 身份驗證。正式產品仍需要伺服器端工作台成員及角色授權。" : "This private review uses ChatGPT identity. Production still requires server-side workspace membership and role authorization."}</p><Button asChild className="w-full" size="lg"><a href={signInHref ?? `/${locale}/owner/onboarding`} target="_top"><ShieldCheck />{isChinese ? "使用 ChatGPT 繼續" : "Continue with ChatGPT"}<ArrowRight /></a></Button><div className="auth-divider"><span>{isChinese ? "尚未認領商戶？" : "Haven’t claimed a business?"}</span></div><Button asChild variant="outline" className="w-full"><Link href={`/${locale}/scan`}><ScanSearch />{isChinese ? "先免費掃描" : "Start with a free scan"}</Link></Button><p className="privacy-note"><LockKeyhole />{isChinese ? "登入只識別目前使用者；工作台授權與每項操作權限仍是獨立安全界線。" : "Sign-in identifies the viewer; workspace authorization and mutation permissions remain separate boundaries."}</p></section>
      </main>
    </PublicPageFrame>
  )
}

export function SelectWorkspacePage({ locale }: { locale: PrototypeLocale }) {
  const isChinese = locale !== "en"
  return (
    <PublicPageFrame locale={locale}>
      <main className="select-workspace-page"><header><Badge variant="outline">{isChinese ? "已以店主身份登入 · 示範" : "Signed in as owner · Demo"}</Badge><h1>{isChinese ? "選擇工作台或地點" : "Choose a workspace or location"}</h1><p>{isChinese ? "選擇後會再次檢查你的角色及地點範圍。" : "Your role and location scope are re-checked after selection."}</p></header><div className="workspace-choice-grid"><Link href={`/${locale}/owner/kam-man-house?location=all`}><span className="workspace-choice-icon">錦</span><div><Badge>{isChinese ? "店主" : "Owner"}</Badge><h2>錦汶館</h2><p>{isChinese ? "2 個地點 · 香港市場" : "2 locations · Hong Kong market"}</p><small>{isChinese ? "所有地點存取" : "All-locations access"}</small></div><ArrowRight /></Link><Link href={`/${locale}/owner/kam-man-house?location=yik-yam`}><span className="workspace-choice-icon"><MapPin /></span><div><Badge variant="outline">{isChinese ? "地點" : "Location"}</Badge><h2>{isChinese ? "奕蔭街" : "Yik Yam Street"}</h2><p>{isChinese ? "評分 62 · 覆蓋率 78%" : "Score 62 · Coverage 78%"}</p><small>{isChinese ? "1 項緊急行動" : "1 urgent action"}</small></div><ArrowRight /></Link><Link href={`/${locale}/owner/kam-man-house/insights?location=tin-hau`}><span className="workspace-choice-icon"><MapPin /></span><div><Badge variant="outline">{isChinese ? "地點" : "Location"}</Badge><h2>{isChinese ? "天后" : "Tin Hau"}</h2><p>{isChinese ? "評分 69 · 覆蓋率 82%" : "Score 69 · Coverage 82%"}</p><small>{isChinese ? "沒有緊急行動" : "No urgent actions"}</small></div><ArrowRight /></Link></div><div className="permission-note"><ShieldCheck /><span>{isChinese ? "錯誤工作台或已撤銷會員的深層連結會被安全拒絕；地點脈絡會保留在後續頁面。" : "Wrong-workspace and revoked-membership links fail closed; location context is preserved across pages."}</span></div></main>
    </PublicPageFrame>
  )
}
