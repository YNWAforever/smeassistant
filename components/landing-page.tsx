"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CircleAlert,
  Clock3,
  Eye,
  Globe2,
  Languages,
  ListChecks,
  MapPin,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserCheck,
} from "lucide-react"

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet"
import {
  DemoBadge,
  FactType,
  LoopRibbon,
  PublicPageFrame,
  ScoreDial,
} from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { formatMarketPrice, marketPricing } from "@/lib/funnel/pricing"
import type { Market } from "@sme-scanner/region"

const supportedSources = [
  { name: "Google Search", detail: "Organic presence and entity-match evidence", icon: Search },
  { name: "Google Maps", detail: "Business profile, reviews and public completeness", icon: MapPin },
  { name: "Google AI surfaces", detail: "AI Overview and AI Mode when present for supported queries", icon: Sparkles },
  { name: "Instagram & website", detail: "Supported public evidence, with honest coverage states", icon: Globe2 },
]

export function LandingPage({ locale, market: initialMarket }: { locale: PrototypeLocale; market: Market }) {
  const t = copy[locale]
  const f = t.funnel.landing
  const router = useRouter()
  const [query, setQuery] = useState("")
  // The hero radio is the market the visitor scans in; plan prices follow it
  // (guardrail 11: market is explicit, the UI language never changes it).
  const [market, setMarket] = useState<Market>(initialMarket)
  const price = formatMarketPrice(marketPricing(market))
  const [error, setError] = useState("")
  const queryInputRef = useRef<HTMLInputElement>(null)
  const ownerStory = locale === "zh-HK"
    ? {
        heroKicker: "為真實老闆日常而設",
        heroTitle: "招呼客人之間，都可以快速睇清下一步。",
        heroBody: "一個有證據、可批准的重點，毋須再拆解另一份報告。",
        heroAlt: "一位咖啡店工作者微笑站在店門前。",
        eyebrow: "真實小店，更清晰的一日",
        sticker: "為日常營運而設",
        title: "少啲儀表板，多啲做決定嘅信心。",
        body: "忙碌老闆不應花時間解讀複雜市場報告。SME Scanner 將公開可見度證據整理成一個簡短、可審閱的決定，再以可比較證據交代改變。",
        points: ["由你已經營緊的生意開始", "每項 AI 草稿都由老闆批准", "用簡單語言睇進度，而非虛榮指標"],
        cta: "由我的生意開始",
        mainAlt: "一位時裝設計師在工作室內繪畫設計草圖。",
        secondaryAlt: "一位小店工作者在貨架前展示商品。",
      }
    : locale === "zh-TW"
      ? {
          heroKicker: "為真實店主日常而設",
          heroTitle: "服務顧客的空檔，也能快速看懂下一步。",
          heroBody: "一個有證據、可核准的重點，不必再拆解另一份報告。",
          heroAlt: "一位咖啡店工作者微笑站在店門前。",
          eyebrow: "真實小店，更清晰的一天",
          sticker: "為日常營運而設",
          title: "少一點儀表板，多一點做決定的信心。",
          body: "忙碌店主不該花時間解讀複雜的行銷報告。SME Scanner 將公開能見度證據整理成一個簡短、可審閱的決定，再以可比較證據說明改變。",
          points: ["從你已經在經營的生意開始", "每一項 AI 草稿都由店主核准", "用簡單語言看進度，而不是虛榮指標"],
          cta: "從我的生意開始",
          mainAlt: "一位服裝設計師在工作室內繪製設計草圖。",
          secondaryAlt: "一位小店工作者在貨架前展示商品。",
        }
      : {
          heroKicker: "Made for real owner days",
          heroTitle: "Clear answers, between serving customers.",
          heroBody: "One evidence-backed next step—without another report to decode.",
          heroAlt: "A café worker smiling at the shop entrance.",
          eyebrow: "Real businesses, clearer days",
          sticker: "Built for the day-to-day",
          title: "Less dashboard. More confidence about the next move.",
          body: "A busy owner should not need to decode marketing reports. SME Scanner turns public visibility evidence into one short, reviewable decision—then returns with comparable proof of what changed.",
          points: ["Start with the business you already run", "Keep every AI-prepared action owner-approved", "See progress in plain language, not vanity metrics"],
          cta: "Start with my business",
          mainAlt: "A fashion designer sketching in a bright sewing studio.",
          secondaryAlt: "A shop worker presenting merchandise in front of stocked shelves.",
        }
  const confidence = locale === "zh-HK"
    ? [
        { title: "一眼看清重要變化", body: "先顯示真正值得你留意的證據，而非一堆難明指標。", icon: Eye },
        { title: "每項行動由你作主", body: "AI 準備草稿，你決定何時批准、匯出或再修改。", icon: UserCheck },
        { title: "下次掃描證明成效", body: "以可比較證據重看結果，清楚分辨改善、推論與未知。", icon: RefreshCw },
      ]
    : locale === "zh-TW"
      ? [
          { title: "一眼看懂重要變化", body: "先呈現真正值得留意的證據，而不是一堆難懂指標。", icon: Eye },
          { title: "每個行動由你決定", body: "AI 準備草稿，你決定何時核准、匯出或再修改。", icon: UserCheck },
          { title: "下次掃描證明成效", body: "用可比較證據重看結果，清楚區分改善、推論與未知。", icon: RefreshCw },
        ]
      : [
          { title: "See the change that matters", body: "Lead with useful evidence, not a wall of difficult metrics.", icon: Eye },
          { title: "Stay in control", body: "AI prepares the work; you approve, edit or export every action.", icon: UserCheck },
          { title: "Come back to proof", body: "The next comparable scan shows what improved and what remains unknown.", icon: RefreshCw },
        ]
  const isChinese = locale !== "en"
  const photoContext = isChinese ? "情境照片（非客戶現場）" : "Context photo (not a customer location)"
  const landingUi = isChinese ? {
    sampleLink: "查看示範報告",
    methodLink: "了解評分方法",
    scannerStep: "免費掃描 · 4 步中的第 1 步",
    scannerBody: "收集任何能見度證據前，先確認商戶及搜尋市場。",
    hkName: "香港",
    hkMeta: "香港市場 · 港元",
    twName: "台灣",
    twMeta: "台灣市場 · 新台幣",
    localeNote: "介面語言與搜尋市場分開設定；改變語言不會改變市場或貨幣。",
    supportedEyebrow: "如實交代覆蓋範圍",
    coverageRules: "查看覆蓋規則",
    supportBadge: "已支援 · 覆蓋因來源而異",
    limitation: "資料可用性會因市場、搜尋字詞、時間及來源而異。缺少的證據會標示為未能取得或未支援，不會當成零分。",
    loopEyebrow: "由一次掃描，變成持續改善節奏",
    loopTitle: "由證據開始，以改善證明作結。",
    loopBody: "SME Scanner 找出能見度證據；Visibility Workspace 協助你決定、審批，並在下次掃描證明改變。",
    loopCards: [
      ["查看證據", "每項發現都附有來源、觀察時間、覆蓋範圍及清晰限制。"],
      ["只做一個重要決定", "系統按影響、工作量、風險及證據強度，排出今日最值得做的一項行動。"],
      ["回來查看可比較成效", "下次掃描會分清已觀察變化、可能關聯、估算及未知。"],
    ],
    workspaceTitle: "知道有甚麼改變，先處理下一個問題，再證明改善。",
    workspaceBody: "一個持續使用的工作台，包含定期重新掃描、優先行動、版本草稿、店主審批、匯出及可比較成效。",
    workspacePoints: ["以行動為先的手機簡報", "由證據到審批的完整紀錄", "兼顧覆蓋率的評分歷史"],
    workspaceCta: "查看公開唯讀工作台",
    briefTitle: "今日能見度簡報",
    briefPriority: "今日首要行動",
    briefAction: "回覆 7 則未回覆評論",
    briefMeta: "店主需時 10 分鐘 · 7 則評論回覆草稿已備妥",
    briefProof: "上次回覆後，回覆率提高 9 個百分點。",
  } : {
    sampleLink: "Explore a sample report",
    methodLink: "Read the methodology",
    scannerStep: "Free scanner · Step 1 of 4",
    scannerBody: "Confirm the business and market before any visibility evidence is collected.",
    hkName: "Hong Kong",
    hkMeta: "HK market · HKD",
    twName: "Taiwan",
    twMeta: "TW market · TWD",
    localeNote: "Interface language and search market are separate; changing language never changes market or currency.",
    supportedEyebrow: "Truthful coverage",
    coverageRules: "Coverage rules",
    supportBadge: "Supported · coverage varies",
    limitation: "Availability varies by market, query, time and provider. Missing evidence is shown as unavailable or unsupported—not scored as zero.",
    loopEyebrow: "From one scan to an operating rhythm",
    loopTitle: "A closed loop that starts with evidence and ends with proof.",
    loopBody: "SME Scanner discovers the evidence. Visibility Workspace helps the owner decide, approve and check what changed next.",
    loopCards: [
      ["See the evidence", "Every finding carries source, observation time, coverage and a plain-language limitation."],
      ["Make one owner decision", "The next action is ranked by impact, effort, risk and evidence strength."],
      ["Return to comparable proof", "A later scan separates observed change, plausible attribution, estimates and unknowns."],
    ],
    workspaceTitle: "Know what changed. Fix the next visibility problem. Prove what improved.",
    workspaceBody: "One recurring workspace for scheduled rescans, prioritised actions, versioned drafts, owner approvals, exports and comparable outcomes.",
    workspacePoints: ["Action-first mobile operating brief", "Evidence-to-approval audit trail", "Coverage-aware score history"],
    workspaceCta: "View the public read-only workspace",
    briefTitle: "Today’s visibility brief",
    briefPriority: "Today’s priority",
    briefAction: "Reply to 7 unanswered reviews",
    briefMeta: "10 min owner time · 7 review-reply drafts ready",
    briefProof: "Response rate improved by 9 points after the previous reply batch.",
  }
  const displaySources = isChinese ? [
    { name: "Google 搜尋", detail: "自然搜尋曝光及商戶實體配對證據", icon: Search },
    { name: "Google 地圖", detail: "商戶檔案、評論及公開資料完整度", icon: MapPin },
    { name: "Google AI 搜尋版面", detail: "在支援的搜尋字詞出現時量度 AI Overview 及 AI Mode", icon: Sparkles },
    { name: "Instagram 及網站", detail: "量度可取得的公開證據，並如實顯示覆蓋狀態", icon: Globe2 },
  ] : supportedSources
  const agentRoles = isChinese ? [
    { title: "能見度偵察", english: "Visibility Scout", body: "檢查 Google、地圖、網站及可支援的公開來源，找出可核實的缺口。", output: "已發現：7 則評論未回覆", icon: Eye },
    { title: "優先次序教練", english: "Priority Coach", body: "按影響、急切性、工作量、風險及證據強度，選出最值得先做的一件事。", output: "今日首要行動已排好", icon: ListChecks },
    { title: "行動與品質工作室", english: "Action & Quality Studio", body: "調度評論回覆、社交內容、海報、餐牌翻譯或 SEO 專員，再檢查品牌事實與品質。", output: "7 則評論回覆草稿已備妥", icon: Sparkles },
    { title: "審批與成效", english: "Approval & Proof", body: "保留版本、權限及審批紀錄；匯出或發佈後安排重新掃描，證明有甚麼改善。", output: "待你審批 · 不會自動發佈", icon: ShieldCheck },
  ] : [
    { title: "Visibility Scout", english: "Evidence discovery", body: "Checks Google, Maps, the website and supported public sources for verifiable gaps.", output: "Found: 7 unanswered reviews", icon: Eye },
    { title: "Priority Coach", english: "Decision support", body: "Ranks the one best next action by impact, urgency, effort, risk and evidence strength.", output: "Today’s priority is ready", icon: ListChecks },
    { title: "Action & Quality Studio", english: "Specialist execution", body: "Routes work to the right specialist, then checks brand facts, quality and safety.", output: "7 review-reply drafts prepared", icon: Sparkles },
    { title: "Approval & Proof", english: "Owner control", body: "Keeps versions, permissions and approvals, then schedules a re-scan after export or publishing.", output: "Awaiting you · never auto-published", icon: ShieldCheck },
  ]
  const comparison = isChinese ? {
    eyebrow: "不是另一個 AI 工具",
    title: "將報告之後的工作，接成一個可證明的改善循環。",
    body: "一般工具幫你產生內容，報告幫你列出問題，代辦則替你執行。SME Scanner 的獨特之處，是用同一套證據連接決定、審批、執行與重掃。",
    caption: "SME Scanner 與其他常見選擇的類別比較",
    headers: ["比較重點", "SME Scanner", "一般 AI 工具", "傳統 SEO 報告", "代理商服務"],
    rows: [
      ["證據基礎", "逐項列出來源、時間、覆蓋及限制", "按提示產生，需自行核實", "定期快照與問題清單", "視服務及報告而定"],
      ["今日先做甚麼", "按影響、工作量、風險及信心排出一項", "由你自行比較答案", "通常交付一份改善清單", "按合約與專案排程"],
      ["AI 如何協作", "一隊共用商戶事實的 AI Visibility Team", "分散對話與工具", "通常止於分析", "由專案團隊分工"],
      ["店主控制", "每項草稿明確審批；不會自動發佈", "需自行把關與複製", "報告後自行執行", "視授權範圍而定"],
      ["執行交付", "審批後匯出；連接後才可發佈", "逐項複製到其他渠道", "另行安排或外判", "由服務團隊處理"],
      ["成效證明", "重掃並保留可比較變更紀錄", "一般不會持續追蹤", "等待下一份報告", "視匯報週期而定"],
    ],
    promises: ["一次只聚焦一項優先行動", "由店主掌握每次審批", "用重掃證據交代有沒有改善"],
  } : {
    eyebrow: "Not another AI tool",
    title: "Connect the work after the report into one provable improvement loop.",
    body: "AI tools generate. Reports diagnose. Agencies execute. SME Scanner is different because one evidence trail connects the decision, approval, action and comparable re-scan.",
    caption: "Category comparison between SME Scanner and common alternatives",
    headers: ["What matters", "SME Scanner", "Generic AI tools", "SEO audit reports", "Agency retainers"],
    rows: [
      ["Evidence", "Source, time, coverage and limits on every finding", "Prompt-led; you verify", "Periodic snapshot and issue list", "Depends on service and reporting"],
      ["What to do now", "One action ranked by impact, effort, risk and confidence", "You reconcile the answers", "Usually a list of fixes", "Contract and project schedule"],
      ["AI coordination", "One team sharing the same business truth", "Separate chats and tools", "Usually stops at analysis", "Project-team handoffs"],
      ["Owner control", "Explicit approval; never auto-published", "You review and copy", "You act after delivery", "Depends on delegated authority"],
      ["Delivery", "Export after approval; publish only when connected", "Copy into each channel", "Arrange separately", "Handled by the service team"],
      ["Proof", "Comparable re-scan and change record", "Usually not tracked", "Wait for the next report", "Depends on reporting cycle"],
    ],
    promises: ["One priority at a time", "Owner approval on every action", "Comparable evidence of what improved"],
  }
  const sampleCase = isChinese ? {
    eyebrow: "成效示範 · Demo data",
    title: "由一項店主批准的行動，看見可追蹤的改變。",
    body: "以示範商戶「錦汶館」為例：系統先找出回覆缺口，準備草稿，再由店主批准回覆批次。兩個可比較的 Google 商家檔案快照顯示，評論回覆率其後上升。",
    before: "8 月 5 日 · 行動前快照",
    beforeLabel: "評論回覆率",
    action: "店主批准的行動",
    actionDate: "8 月 5 日",
    actionLabel: "店主核准並匯出評論回覆草稿",
    after: "8 月 20 日 · 可比較重掃",
    afterLabel: "評論回覆率",
    delta: "+9 個百分點",
    evidenceTitle: "同一地點及來源 · 覆蓋率 100% · 15 日比較窗口",
    caveat: "這是示範資料，只反映兩個公開快照之間的時間關聯；不代表已證明帶來收入、預約或因果影響。持續重掃才能看清改善是否維持。",
    sampleCta: "查看示範報告",
    workspaceCta: "查看公開唯讀工作台",
  } : {
    eyebrow: "Outcome example · Demo data",
    title: "See a trackable change from one owner-approved action.",
    body: "In the Kam Man House demo, the system found a response gap, prepared drafts and waited for owner approval. Two comparable Google Business snapshots then showed a higher review response rate.",
    before: "5 Aug · pre-action snapshot",
    beforeLabel: "Review response rate",
    action: "Owner-approved action",
    actionDate: "5 Aug",
    actionLabel: "Owner approved and exported reply drafts",
    after: "20 Aug · comparable re-scan",
    afterLabel: "Review response rate",
    delta: "+9 percentage points",
    evidenceTitle: "Same location and source · 100% coverage · 15-day window",
    caveat: "Demo data: this is a temporal association between two public snapshots. It does not prove revenue, bookings or causal impact. Recurring re-scans are needed to see whether the change holds.",
    sampleCta: "View sample report",
    workspaceCta: "View public read-only workspace",
  }

  function startSearch(event: React.FormEvent) {
    event.preventDefault()
    if (!query.trim()) {
      setError(locale === "en" ? "Enter a business name or Google Maps link." : "請輸入商戶名稱或 Google Maps 連結。")
      queryInputRef.current?.focus()
      return
    }
    const params = new URLSearchParams({ market, business: query.trim() })
    router.push(`/${locale}/scan?${params.toString()}`)
  }

  return (
    <PublicPageFrame locale={locale}>
      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <Badge variant="outline" className="hero-eyebrow"><ScanSearch /> {t.landing.eyebrow}</Badge>
            <h1>{t.landing.title}</h1>
            <p className="hero-lead">{t.landing.body}</p>
            <div className="trust-row" aria-label={t.landing.trust}>
              <ShieldCheck aria-hidden="true" /><span>{t.landing.trust}</span>
            </div>
            <div className="hero-links">
              <Link href={`/${locale}/sample-report`}>{landingUi.sampleLink} <ArrowRight /></Link>
              <Link href={`/${locale}/methodology`}>{landingUi.methodLink}</Link>
            </div>
            <figure className="owner-moment-card">
              <img
                src="https://images.pexels.com/photos/4473399/pexels-photo-4473399.jpeg?auto=compress&dpr=1&h=750&w=1260"
                alt={ownerStory.heroAlt}
                width="1260"
                height="750"
                fetchPriority="high"
              />
              <span className="context-photo-label">{isChinese ? "情境示意 · 非客戶案例" : "Context image · not a customer case"}</span>
              <figcaption>
                <span><BadgeCheck aria-hidden="true" /> {ownerStory.heroKicker}</span>
                <strong>{ownerStory.heroTitle}</strong>
                <small>{ownerStory.heroBody}</small>
                <a href="https://www.pexels.com/photo/happy-ethnic-coffee-shop-owner-standing-at-entrance-door-4473399/" target="_blank" rel="noreferrer">{photoContext} · Photo: Ketut Subiyanto / Pexels</a>
              </figcaption>
            </figure>
          </div>
          <form className="business-search-card" onSubmit={startSearch} noValidate>
            <div className="search-card-heading">
              <span className="step-kicker">{landingUi.scannerStep}</span>
              <h2>{t.landing.searchLabel}</h2>
              <p>{landingUi.scannerBody}</p>
            </div>
            {error && <div id="business-search-error" className="form-error" role="alert"><CircleAlert /> {error}</div>}
            <div className="field-stack">
              <Label htmlFor="business-search">{t.landing.searchLabel}</Label>
              <div className="input-with-icon"><Search /><Input ref={queryInputRef} id="business-search" value={query} onChange={(event) => { setQuery(event.target.value); setError("") }} placeholder={t.landing.searchPlaceholder} aria-invalid={Boolean(error)} aria-describedby={error ? "business-search-error" : undefined} /></div>
            </div>
            <fieldset className="field-stack">
              <legend>{t.landing.marketLabel}</legend>
              <RadioGroup className="market-choice-grid" value={market} onValueChange={(value) => setMarket(value as Market)}>
                <Label className="market-choice" htmlFor="market-hk"><RadioGroupItem id="market-hk" value="hk" /><span><strong>{landingUi.hkName}</strong><small>{landingUi.hkMeta}</small></span></Label>
                <Label className="market-choice" htmlFor="market-tw"><RadioGroupItem id="market-tw" value="tw" /><span><strong>{landingUi.twName}</strong><small>{landingUi.twMeta}</small></span></Label>
              </RadioGroup>
            </fieldset>
            <div className="locale-market-note"><Languages /><span><strong>{t.language}</strong> · {landingUi.localeNote}</span></div>
            <Button size="lg" className="primary-action" type="submit">{t.landing.start}<ArrowRight /></Button>
            <p className="timing-note"><Clock3 /> {f.timing}</p>
          </form>
        </section>

        <section className="owner-confidence-strip" aria-labelledby="owner-confidence-title">
          <h2 id="owner-confidence-title" className="sr-only">{locale === "en" ? "Built for busy business owners" : "為忙碌中小企老闆而設"}</h2>
          {confidence.map(({ title, body, icon: Icon }) => (
            <article key={title}>
              <span aria-hidden="true"><Icon /></span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </article>
          ))}
        </section>

        <section className="owner-story-section" aria-labelledby="owner-story-title">
          <div className="owner-story-visuals" aria-label={locale === "en" ? "Independent business owners at work" : "正在工作的獨立小店團隊"}>
            <figure className="owner-story-main-photo">
              <img
                src="https://images.pexels.com/photos/7147547/pexels-photo-7147547.jpeg?auto=compress&dpr=1&h=750&w=1260"
                alt={ownerStory.mainAlt}
                width="1260"
                height="750"
                loading="lazy"
                decoding="async"
              />
              <figcaption><a href="https://www.pexels.com/photo/smiling-asian-tailor-with-illustration-against-sewing-machine-in-workroom-7147547/" target="_blank" rel="noreferrer">{photoContext} · Photo: Michael Burrows / Pexels</a></figcaption>
            </figure>
            <figure className="owner-story-secondary-photo">
              <img
                src="https://images.pexels.com/photos/6949788/pexels-photo-6949788.jpeg?auto=compress&dpr=1&h=750&w=1260"
                alt={ownerStory.secondaryAlt}
                width="1260"
                height="750"
                loading="lazy"
                decoding="async"
              />
              <figcaption><a href="https://www.pexels.com/photo/portrait-of-a-woman-in-a-store-6949788/" target="_blank" rel="noreferrer">{photoContext} · Photo: Prem Kumar / Pexels</a></figcaption>
            </figure>
            <span className="owner-story-sticker" aria-hidden="true"><Sparkles /> {ownerStory.sticker}</span>
          </div>
          <div className="owner-story-copy">
            <p className="eyebrow">{ownerStory.eyebrow}</p>
            <h2 id="owner-story-title">{ownerStory.title}</h2>
            <p>{ownerStory.body}</p>
            <ul>
              {ownerStory.points.map((point) => <li key={point}><span aria-hidden="true"><Check /></span>{point}</li>)}
            </ul>
            <Button asChild size="lg"><Link href={`/${locale}/scan`}>{ownerStory.cta}<ArrowRight /></Link></Button>
          </div>
        </section>

        <section className="supported-strip" aria-labelledby="supported-title">
          <div className="section-heading-inline"><div><p className="eyebrow">{landingUi.supportedEyebrow}</p><h2 id="supported-title">{t.landing.checked}</h2></div><Link href={`/${locale}/methodology`}>{landingUi.coverageRules} <ArrowRight /></Link></div>
          <div className="source-grid">
            {displaySources.map(({ name, detail, icon: Icon }) => <article key={name}><span className="source-icon"><Icon /></span><div><h3>{name}</h3><p>{detail}</p></div><Badge variant="outline">{landingUi.supportBadge}</Badge></article>)}
          </div>
          <p className="limitation-note"><TriangleAlert /> {landingUi.limitation}</p>
        </section>

        <section className="product-loop-section">
          <div className="section-heading-centered"><p className="eyebrow">{landingUi.loopEyebrow}</p><h2>{landingUi.loopTitle}</h2><p>{landingUi.loopBody}</p></div>
          <LoopRibbon active={0} />
          <div className="loop-proof-grid">
            {landingUi.loopCards.map(([title, body], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </section>

        <section id="why-sme-scanner" className="comparison-section" aria-labelledby="comparison-title">
          <div className="comparison-heading">
            <div>
              <p className="eyebrow">{comparison.eyebrow}</p>
              <h2 id="comparison-title">{comparison.title}</h2>
            </div>
            <p>{comparison.body}</p>
          </div>
          <div className="comparison-promises" aria-label={locale === "en" ? "SME Scanner product promises" : "SME Scanner 產品承諾"}>
            {comparison.promises.map((item) => <span key={item}><Check aria-hidden="true" />{item}</span>)}
          </div>
          <div className="comparison-table-shell" role="region" aria-labelledby="comparison-title" tabIndex={0}>
            <Table className="comparison-table">
              <TableCaption className="sr-only">{comparison.caption}</TableCaption>
              <TableHeader>
                <TableRow>
                  {comparison.headers.map((header, index) => <TableHead key={header} scope="col" className={index === 1 ? "is-sme" : ""}>{header}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.rows.map((row) => (
                  <TableRow key={row[0]}>
                    {row.map((cell, index) => index === 0
                      ? <TableHead key={cell} scope="row">{cell}</TableHead>
                      : <TableCell key={cell} className={index === 1 ? "is-sme" : ""}>{index === 1 && <Check aria-hidden="true" />}{cell}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="comparison-scroll-note">{isChinese ? "手機可左右滑動查看完整比較" : "Swipe sideways on mobile to see the full comparison"}</p>
          <p className="comparison-fairness-note">{isChinese ? "此為類別層級概括；個別產品與服務能力可能不同。" : "This is a category-level summary; individual products and services may differ."}</p>
        </section>

        <section className="agent-team-section" aria-labelledby="agent-team-title">
          <div className="agent-team-heading">
            <div><p className="eyebrow">{isChinese ? "一個工作台 · 一隊協作團隊" : "One workspace · one coordinated team"}</p><h2 id="agent-team-title">{isChinese ? "你只需決定下一步；AI 專員在背後協作。" : "You decide the next move; specialists coordinate backstage."}</h2></div>
            <p>{isChinese ? "你毋須逐個選擇、提示或管理 Agent。SME Scanner 會按最新證據調度合適專員，交給你的永遠是一項清晰優先工作、可審批草稿和之後的成效證明。" : "You never need to select, prompt or reconcile separate agents. SME Scanner routes the evidence to the right specialists and returns one priority, an owner-ready draft and proof later."}</p>
          </div>
          <div className="agent-gateway"><span><Building2 /> {isChinese ? "商戶事實庫" : "Business Truth"}</span><ArrowRight /><strong>{isChinese ? "AI 能見度團隊" : "AI Visibility Team"}</strong><ArrowRight /><span><UserCheck /> {isChinese ? "店主保留最後決定" : "Owner keeps final control"}</span></div>
          <div className="operator-explainer"><Sparkles /><div><Badge variant="outline">Visibility Operator</Badge><strong>{isChinese ? "隨身增長助理不是另一個 Agent。" : "The Pocket Growth Assistant is not another agent."}</strong><span>{isChinese ? "它只讀取目前頁面、scan_id、證據與版本狀態，解釋問題並調度合適能力；任何輸出仍要建立新版本及由店主審批。" : "It reads the current surface, scan ID, evidence and version state, then explains the issue and routes the right capability. Every output still becomes a new owner-approved version."}</span></div></div>
          <div className="agent-role-grid">
            {agentRoles.map(({ title, english, body, output, icon: Icon }, index) => <article key={title}><div className="agent-role-top"><span className="agent-role-index">0{index + 1}</span><span className="agent-role-icon"><Icon /></span></div><small>{english}</small><h3>{title}</h3><p>{body}</p><strong><Check /> {output}</strong></article>)}
          </div>
          <div className="agent-specialist-row"><span>{isChinese ? "按需要調度：" : "Specialists routed when relevant:"}</span>{(isChinese ? ["評論回覆", "社交內容", "海報／圖片", "餐牌翻譯", "SEO／AI 能見度"] : ["Review replies", "Social posts", "Poster / image", "Menu translation", "SEO / AI visibility"]).map((item) => <Badge key={item} variant="outline">{item}</Badge>)}</div>
          <div className="owner-control-banner"><ShieldCheck /><div><strong>{isChinese ? "所有工作台及專人方案都保留店主審批" : "Owner approval is included in every workspace and managed plan"}</strong><span>{isChinese ? "免費掃描只提供證據與優先建議；工作台不會自動對外發佈。只有正確權限、清楚審批紀錄及可還原路徑，才可匯出或發佈。" : "The free scanner provides evidence and priorities only. Workspace delivery requires the right permission, an explicit approval record and a recoverable path."}</span></div></div>
        </section>

        <section id="sample-case" className="sample-case-section" aria-labelledby="sample-case-title">
          <div className="sample-case-copy">
            <div className="sample-case-label"><DemoBadge locale={locale} /><span>{sampleCase.eyebrow}</span></div>
            <h2 id="sample-case-title">{sampleCase.title}</h2>
            <p>{sampleCase.body}</p>
            <div className="sample-case-actions">
              <Button asChild><Link href={`/${locale}/sample-report`}>{sampleCase.sampleCta}<ArrowRight /></Link></Button>
              <ContextualAssistant locale={locale} surface="sample" />
              <Button asChild variant="outline"><Link href={`/${locale}/demo-workspace`}>{sampleCase.workspaceCta}</Link></Button>
            </div>
          </div>
          <div className="sample-case-proof">
            <div className="sample-case-business"><span>{isChinese ? "香港示範商家 · 錦汶館 · 奕蔭街" : "Hong Kong demo business · 錦汶館 · Yik Yam Street"}</span><Badge variant="outline">Google Business</Badge></div>
            <div className="sample-case-steps">
              <article><span>{sampleCase.before}</span><strong>22%</strong><small>{sampleCase.beforeLabel}</small></article>
              <ArrowRight aria-hidden="true" />
              <article className="is-action"><span>{sampleCase.action}</span><strong>{sampleCase.actionDate}</strong><small>{sampleCase.actionLabel}</small></article>
              <ArrowRight aria-hidden="true" />
              <article className="is-after"><span>{sampleCase.after}</span><strong>31%</strong><small>{sampleCase.afterLabel}</small><em>{sampleCase.delta}</em></article>
            </div>
            <div className="sample-case-evidence">
              <FactType type="Observed" />
              <div><strong>{sampleCase.evidenceTitle}</strong><p>{sampleCase.caveat}</p></div>
            </div>
          </div>
        </section>

        <section className="home-plan-section" aria-labelledby="home-plan-title">
          <div className="section-heading-inline"><div><p className="eyebrow">{isChinese ? "由證據開始，按業務步伐升級" : "Start with evidence, scale with the business"}</p><h2 id="home-plan-title">{isChinese ? "先免費看清問題，再選擇合適的執行節奏。" : "See the issue for free, then choose the right operating rhythm."}</h2></div><Button asChild variant="outline"><Link href={`/${locale}/pricing`}>{isChinese ? "比較所有方案" : "Compare all plans"}<ArrowRight /></Link></Button></div>
          <div className="free-plan-banner"><div><Badge variant="outline">{isChinese ? "一次免費掃描" : "One free scan"}</Badge><h3>{isChinese ? "SME Scanner · 免費" : "SME Scanner · Free"}</h3><p>{isChinese ? "查看能見度快照、證據來源及最值得先處理的問題，毋須登入開始。" : "See a visibility snapshot, source evidence and the best next issue to tackle—no login required."}</p></div><Button asChild><Link href={`/${locale}/scan`}>{isChinese ? "免費掃描" : "Start free scan"}<ArrowRight /></Link></Button></div>
          <div className="paid-plan-preview-grid">
            <article className="is-featured"><Badge>{isChinese ? "最適合單一地點" : "Best for one location"}</Badge><h3>{isChinese ? "增長工作台" : "Growth Workspace"}</h3><strong>{price}<small>/{f.perMonth}</small></strong><p>{isChinese ? "1 個地點 · 每月 12 次核准後交付 · 2 位用戶" : "1 location · 12 approved deliveries/month · 2 users"}</p></article>
            <article><Badge variant="outline">{isChinese ? "最多 3 個地點" : "Up to 3 locations"}</Badge><h3>{isChinese ? "多地點工作台" : "Multi-location"}</h3><strong>{f.contactPricing}</strong><p>{isChinese ? "3 個地點 · 每月共用 36 次核准後交付" : "3 locations · 36 pooled approved deliveries/month"}</p></article>
            <article><Badge variant="outline">{isChinese ? "專人協作" : "Human-managed"}</Badge><h3>{isChinese ? "專人能見度服務" : "Managed Visibility"}</h3><strong>{f.contactPricing}</strong><p>{isChinese ? "專人協助執行與檢視 · 最短 3 個月" : "Human execution and review · 3-month minimum"}</p></article>
          </div>
          <p className="plan-test-note">{f.planNote}</p>
        </section>

        <section className="workspace-preview-section">
          <div className="workspace-preview-copy">
            <Badge variant="outline">Visibility Workspace</Badge>
            <h2>{landingUi.workspaceTitle}</h2>
            <p>{landingUi.workspaceBody}</p>
            <ul className="check-list">
              {landingUi.workspacePoints.map((item) => <li key={item}><Check /> {item}</li>)}
            </ul>
            <Button asChild><Link href={`/${locale}/demo-workspace`}>{landingUi.workspaceCta} <ArrowRight /></Link></Button>
          </div>
          <div className="brief-preview-card" aria-label={isChinese ? "示範店主簡報" : "Sample owner brief"}>
            <div className="preview-card-top"><div><small>錦汶館 · Yik Yam Street</small><strong>{landingUi.briefTitle}</strong></div><DemoBadge locale={locale} /></div>
            <div className="preview-score-row"><ScoreDial score={62} coverage={78} delta={-4} /><div className="preview-priority"><span>{landingUi.briefPriority}</span><strong>{landingUi.briefAction}</strong><small>{landingUi.briefMeta}</small></div></div>
            <div className="preview-outcome"><FactType type="Observed" /><span>{landingUi.briefProof}</span></div>
          </div>
        </section>
      </main>
    </PublicPageFrame>
  )
}
