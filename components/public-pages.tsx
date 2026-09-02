"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronLeft,
  CircleAlert,
  Clock3,
  Eye,
  FileCheck2,
  Globe2,
  KeyRound,
  Languages,
  Link2,
  ListChecks,
  LockKeyhole,
  Mail,
  MapPin,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { actions, merchant, providers } from "@/lib/demo-data"
import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet"
import {
  CapabilityBadge,
  DemoBadge,
  FactType,
  LoopRibbon,
  ProviderBadge,
  PublicPageFrame,
  ScoreDial,
  SectionCard,
} from "@/components/product-ui"

const supportedSources = [
  { name: "Google Search", detail: "Organic presence and entity-match evidence", icon: Search },
  { name: "Google Maps", detail: "Business profile, reviews and public completeness", icon: MapPin },
  { name: "Google AI surfaces", detail: "AI Overview and AI Mode when present for supported queries", icon: Sparkles },
  { name: "Instagram & website", detail: "Supported public evidence, with honest coverage states", icon: Globe2 },
]

export function LandingPage({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale]
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [market, setMarket] = useState(locale === "zh-TW" ? "tw" : "hk")
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
              <RadioGroup className="market-choice-grid" value={market} onValueChange={setMarket}>
                <Label className="market-choice" htmlFor="market-hk"><RadioGroupItem id="market-hk" value="hk" /><span><strong>{landingUi.hkName}</strong><small>{landingUi.hkMeta}</small></span></Label>
                <Label className="market-choice" htmlFor="market-tw"><RadioGroupItem id="market-tw" value="tw" /><span><strong>{landingUi.twName}</strong><small>{landingUi.twMeta}</small></span></Label>
              </RadioGroup>
            </fieldset>
            <div className="locale-market-note"><Languages /><span><strong>{t.language}</strong> · {landingUi.localeNote}</span></div>
            <Button size="lg" className="primary-action" type="submit">{t.landing.start}<ArrowRight /></Button>
            <p className="timing-note"><Clock3 /> {t.landing.timing}</p>
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
            <article className="is-featured"><Badge>{isChinese ? "最適合單一地點" : "Best for one location"}</Badge><h3>{isChinese ? "增長工作台" : "Growth Workspace"}</h3><strong>HK$888<small>/{isChinese ? "月" : "month"}</small></strong><p>{isChinese ? "1 個地點 · 每月 12 次核准後交付 · 2 位用戶" : "1 location · 12 approved deliveries/month · 2 users"}</p></article>
            <article><Badge variant="outline">{isChinese ? "最多 3 個地點" : "Up to 3 locations"}</Badge><h3>{isChinese ? "多地點工作台" : "Multi-location"}</h3><strong>HK$1,988<small>/{isChinese ? "月" : "month"}</small></strong><p>{isChinese ? "3 個地點 · 每月共用 36 次核准後交付" : "3 locations · 36 pooled approved deliveries/month"}</p></article>
            <article><Badge variant="outline">{isChinese ? "專人協作" : "Human-managed"}</Badge><h3>{isChinese ? "專人能見度服務" : "Managed Visibility"}</h3><strong>HK$6,800<small>{isChinese ? " 起／月" : "+ / month"}</small></strong><p>{isChinese ? "專人協助執行與檢視 · 最短 3 個月" : "Human execution and review · 3-month minimum"}</p></article>
          </div>
          <p className="plan-test-note">{isChinese ? "方向性測試價格 · 付款尚未在此原型連接 · 介面語言不會自動改變市場或貨幣" : "Directional test pricing · Checkout is not connected in this prototype · Interface language never changes market or currency"}</p>
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

const scanSteps = ["Confirm business", "Market & goal", "Optional channels", "Consent & start"]

export function ScanPage({ locale, requestedBusiness, requestedMarket }: { locale: PrototypeLocale; requestedBusiness?: string; requestedMarket?: string }) {
  const isChinese = locale !== "en"
  const steps = isChinese ? ["確認商戶", "市場與目標", "選填渠道", "同意並開始"] : scanSteps
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [business, setBusiness] = useState(requestedBusiness?.trim() ?? "")
  const [candidate, setCandidate] = useState(Boolean(requestedBusiness?.trim()))
  const [manual, setManual] = useState(false)
  const [market, setMarket] = useState(requestedMarket === "tw" || requestedMarket === "hk" ? requestedMarket : locale === "zh-TW" ? "tw" : "hk")
  const [industry, setIndustry] = useState("fnb")
  const [goal, setGoal] = useState("visibility")
  const [website, setWebsite] = useState("https://kammanhouse.example")
  const [instagram, setInstagram] = useState("@kammanhouse")
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState("")

  function next() {
    if (step === 1 && !business.trim()) { setError(isChinese ? "請先輸入商戶名稱。" : "Enter a business name before continuing."); return }
    if (step === 1 && !candidate && !manual) { setError(isChinese ? "請確認配對結果，或選擇以手動資料繼續。" : "Confirm a match or choose to continue without one."); return }
    if (step === 4 && !consent) { setError(isChinese ? "請確認我們可以為此示範掃描收集公開證據。" : "Confirm that we may collect public evidence for this sample scan."); return }
    setError("")
    if (step < 4) setStep(step + 1)
    else {
      const params = new URLSearchParams({ business: business.trim(), market })
      router.push(`/${locale}/scanning/demo-job-247?${params.toString()}`)
    }
  }

  return (
    <PublicPageFrame locale={locale}>
      <main className="flow-page">
        <Link className="back-link" href={`/${locale}`}><ChevronLeft /> {isChinese ? "返回 SME Scanner" : "Back to SME Scanner"}</Link>
        <div className="flow-layout">
          <aside className="flow-steps" aria-label={isChinese ? "掃描步驟" : "Scan steps"}>
            <p className="eyebrow">{isChinese ? "免費證據掃描" : "Free evidence scan"}</p>
            <ol>{steps.map((label, index) => <li key={label} className={step === index + 1 ? "is-active" : step > index + 1 ? "is-complete" : ""}><span>{step > index + 1 ? <Check /> : index + 1}</span><div><strong>{label}</strong><small>{isChinese ? (index === 0 ? "身份與商戶資料" : index === 1 ? "語言與市場分開" : index === 2 ? "增加覆蓋" : "限於指定用途") : (index === 0 ? "Identity and listing" : index === 1 ? "Locale stays separate" : index === 2 ? "Improve coverage" : "Purpose-limited")}</small></div></li>)}</ol>
            <div className="flow-security"><ShieldCheck /><div><strong>{isChinese ? "只收集公開證據" : "Public evidence only"}</strong><p>{isChinese ? "免費掃描不會要求店主專屬資料。" : "No owner-only data is requested in the free scan."}</p></div></div>
          </aside>
          <section className="flow-card" aria-live="polite">
            <div className="flow-card-header"><div><span>{isChinese ? `第 ${step} 步，共 4 步` : `Step ${step} of 4`}</span><h1>{steps[step - 1]}</h1></div><DemoBadge locale={locale} /></div>
            <Progress value={step * 25} aria-label={isChinese ? `掃描設定完成 ${step * 25}%` : `Scan setup ${step * 25}% complete`} />
            {error && <div className="form-error" role="alert"><CircleAlert /> {error}</div>}

            {step === 1 && <div className="step-content">
              <div className="field-stack"><Label htmlFor="scan-business">{isChinese ? "商戶名稱或 Google Maps 連結" : "Business name or Google Maps link"}</Label><div className="input-with-icon"><Search /><Input id="scan-business" value={business} onChange={(event) => { setBusiness(event.target.value); setCandidate(false); setManual(false); setError("") }} /></div><small>{isChinese ? "如有多間同名商戶，請加入地區或地址。" : "Add an area or address if several businesses share the same name."}</small></div>
              {business.trim() && <div className={`candidate-card ${candidate ? "selected" : ""}`}><div className="candidate-map"><MapPin /></div><div><Badge>{isChinese ? "示範配對預覽" : "Sample match preview"}</Badge><h2>{business.trim()}</h2><p>{isChinese ? "正式掃描會按名稱、地區及公開來源核實地址。" : "A production scan verifies the address against the name, area and public sources."}</p><small>{isChinese ? "此原型不會冒認已完成即時商戶配對" : "This prototype does not claim a live business match"}</small></div><Button type="button" variant="outline" onClick={() => { setCandidate(true); setManual(false) }}>{candidate ? <><Check /> {isChinese ? "已確認" : "Confirmed"}</> : (isChinese ? "以此商戶繼續" : "Continue with this business")}</Button></div>}
              <button className="text-action" type="button" onClick={() => { setCandidate(false); setManual(true); setError("") }}>{isChinese ? "這不是我的商戶——以手動資料繼續" : "This is not my business — continue with manual details"}</button>
              {manual && <div className="partial-warning"><TriangleAlert /><div><strong>{isChinese ? "Google 商戶覆蓋可能無法取得" : "Google Business coverage may be unavailable"}</strong><p>{isChinese ? "你仍可繼續；但未確認商戶資料前，我們不會推斷 Google 表現欠佳。" : "You can continue, but without a confirmed listing we will not infer a poor Google score."}</p></div></div>}
            </div>}

            {step === 2 && <div className="step-content two-column-fields">
              <div className="field-stack"><Label htmlFor="scan-market">{isChinese ? "搜尋市場" : "Search market"}</Label><Select value={market} onValueChange={setMarket}><SelectTrigger id="scan-market" className="w-full"><SelectValue>{market === "hk" ? (isChinese ? "香港" : "Hong Kong") : (isChinese ? "台灣" : "Taiwan")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="hk">{isChinese ? "香港" : "Hong Kong"}</SelectItem><SelectItem value="tw">{isChinese ? "台灣" : "Taiwan"}</SelectItem></SelectContent></Select><small>{isChinese ? "控制地理搜尋脈絡及地區規則。" : "Controls geographic query context and regional rules."}</small></div>
              <div className="field-stack"><Label>{isChinese ? "介面語言" : "Interface language"}</Label><div className="read-only-field"><Languages />{copy[locale].language}<Badge variant="outline">{isChinese ? "獨立設定" : "Separate setting"}</Badge></div><small>{isChinese ? "改變語言不會改變搜尋市場。" : "Changing language never changes the search market."}</small></div>
              <div className="field-stack"><Label htmlFor="scan-industry">{isChinese ? "行業" : "Industry"}</Label><Select value={industry} onValueChange={setIndustry}><SelectTrigger id="scan-industry" className="w-full"><SelectValue>{industry === "fnb" ? (isChinese ? "餐飲" : "Restaurant / F&B") : industry === "retail" ? (isChinese ? "零售" : "Retail") : (isChinese ? "本地服務" : "Local service")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="fnb">{isChinese ? "餐飲" : "Restaurant / F&B"}</SelectItem><SelectItem value="retail">{isChinese ? "零售" : "Retail"}</SelectItem><SelectItem value="service">{isChinese ? "本地服務" : "Local service"}</SelectItem></SelectContent></Select></div>
              <div className="field-stack"><Label htmlFor="scan-goal">{isChinese ? "主要目標" : "Primary goal"}</Label><Select value={goal} onValueChange={setGoal}><SelectTrigger id="scan-goal" className="w-full"><SelectValue>{goal === "visibility" ? (isChinese ? "提升能見度" : "Improve visibility") : goal === "trust" ? (isChinese ? "建立顧客信任" : "Build customer trust") : (isChinese ? "取得更多合資格查詢" : "Get more qualified enquiries")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="visibility">{isChinese ? "提升能見度" : "Improve visibility"}</SelectItem><SelectItem value="trust">{isChinese ? "建立顧客信任" : "Build customer trust"}</SelectItem><SelectItem value="leads">{isChinese ? "取得更多合資格查詢" : "Get more qualified enquiries"}</SelectItem></SelectContent></Select></div>
            </div>}

            {step === 3 && <div className="step-content">
              <div className="two-column-fields"><div className="field-stack"><Label htmlFor="website">{isChinese ? "網站" : "Website"} <span>{isChinese ? "選填" : "Optional"}</span></Label><Input id="website" value={website} onChange={(event) => setWebsite(event.target.value)} /><small>{isChinese ? "增加公開內容及技術證據。" : "Adds public content and technical evidence."}</small></div><div className="field-stack"><Label htmlFor="instagram">Instagram <span>{isChinese ? "選填" : "Optional"}</span></Label><Input id="instagram" value={instagram} onChange={(event) => setInstagram(event.target.value)} /><small>{isChinese ? "來源可用性可能不同。" : "Provider availability can vary."}</small></div></div>
              <div className="coverage-preview"><div className="coverage-preview-head"><div><span>{isChinese ? "預計證據覆蓋" : "Expected evidence coverage"}</span><strong>{isChinese ? "4 個主要來源中的 3–4 個" : "3–4 of 4 primary sources"}</strong></div><Badge variant="outline">{isChinese ? "非保證" : "Non-binding"}</Badge></div><div className="coverage-source-list"><span><Check /> {isChinese ? "Google 商戶與地圖" : "Google Business & Maps"}</span><span><Check /> {isChinese ? "公開網站" : "Public website"}</span><span><Check /> {isChinese ? "搜尋與 AI 版面" : "Search & AI surfaces"}</span><span><CircleAlert /> {isChinese ? "Instagram 可能未能取得" : "Instagram may be unavailable"}</span></div></div>
            </div>}

            {step === 4 && <div className="step-content">
              <div className="scan-review-card"><h2>{isChinese ? "檢查這次示範掃描" : "Review this sample scan"}</h2><dl><div><dt>{isChinese ? "商戶" : "Business"}</dt><dd>{business.trim()}</dd></div><div><dt>{isChinese ? "搜尋市場" : "Search market"}</dt><dd>{market === "hk" ? (isChinese ? "香港" : "Hong Kong") : (isChinese ? "台灣" : "Taiwan")}</dd></div><div><dt>{isChinese ? "介面語言" : "Interface language"}</dt><dd>{copy[locale].language}</dd></div><div><dt>{isChinese ? "要求的來源" : "Sources requested"}</dt><dd>{isChinese ? "Google、網站、搜尋／AI 版面、Instagram" : "Google, website, search/AI surfaces, Instagram"}</dd></div></dl></div>
              <Label className="consent-row" htmlFor="scan-consent"><Checkbox id="scan-consent" checked={consent} onCheckedChange={(value) => { setConsent(Boolean(value)); setError("") }} /><span><strong>{isChinese ? "為這次掃描收集可支援的公開證據" : "Collect supported public evidence for this scan"}</strong><small>{isChinese ? "我明白此預覽使用示範資料，而證據可用性可能不同。這不代表我同意接收推廣。" : "I understand the preview uses sample data and that evidence availability may vary. This does not opt me into marketing."}</small></span></Label>
              <div className="privacy-note"><LockKeyhole /><span>{isChinese ? "只限指定用途的公開證據。解鎖或認領真實報告需要另外明確同意。" : "Purpose-limited public evidence. A separate, explicit consent is required to unlock or claim a real report."}</span></div>
            </div>}

            <div className="flow-card-footer"><Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}><ChevronLeft /> {isChinese ? "返回" : "Back"}</Button><Button onClick={next}>{isChinese ? (step === 4 ? "開始示範掃描" : "繼續") : (step === 4 ? "Start sample scan" : "Continue")}<ArrowRight /></Button></div>
          </section>
        </div>
      </main>
    </PublicPageFrame>
  )
}

export function ScanningPage({ locale, requestedBusiness, requestedMarket }: { locale: PrototypeLocale; requestedBusiness?: string; requestedMarket?: string }) {
  const isChinese = locale !== "en"
  const business = requestedBusiness?.trim() || "錦汶館"
  const market = requestedMarket === "tw" ? (isChinese ? "台灣" : "Taiwan") : (isChinese ? "香港" : "Hong Kong")
  const [retried, setRetried] = useState(false)
  const collectors = isChinese ? [
    { name: "掃描對象已保留", detail: `${business} · ${market}`, state: "measured" as const },
    { name: "公開網站證據", detail: "已取得 15 項檢查中的 12 項", state: "measured" as const },
    { name: "Instagram 公開證據", detail: retried ? "重試完成；來源仍未能取得" : "來源沒有回傳完整快照", state: "unavailable" as const },
    { name: "Google 商戶證據", detail: "已取得商戶檔案及評論證據", state: "measured" as const },
    { name: "搜尋與 AI 版面證據", detail: "正在檢查可支援的搜尋字詞", state: "pending" as const },
    { name: "評分與建議", detail: "等待其餘來源狀態", state: "pending" as const },
  ] : [
    { name: "Scan subject retained", detail: `${business} · ${market}`, state: "measured" as const },
    { name: "Public website evidence", detail: "12 of 15 checks captured", state: "measured" as const },
    { name: "Instagram public evidence", detail: retried ? "Retry complete; provider still unavailable" : "Provider did not return a complete snapshot", state: "unavailable" as const },
    { name: "Google Business evidence", detail: "Profile and review evidence captured", state: "measured" as const },
    { name: "Search and AI-surface evidence", detail: "Checking supported queries", state: "pending" as const },
    { name: "Score and recommendations", detail: "Waiting for collector states", state: "pending" as const },
  ]
  return (
    <PublicPageFrame locale={locale}>
      <main className="scanning-page">
        <div className="scan-status-hero">
          <div className="scan-pulse" aria-hidden="true"><ScanSearch /></div>
          <Badge variant="outline">{isChinese ? "掃描編號" : "Scan reference"} · DEMO-247</Badge>
          <h1>{isChinese ? "證據掃描仍在進行" : "Your evidence scan is still working"}</h1>
          <p>{isChinese ? "已有可用證據。我們正等待餘下可支援搜尋檢查，不會虛構完成百分比或時間。" : "Useful evidence is already available. We are waiting on the remaining supported search checks—without fabricating a percentage or finish time."}</p>
          <div className="scan-progress-summary"><Progress value={67} aria-label={isChinese ? "6 個掃描階段中已有 4 個回傳狀態" : "Four of six scan stages have returned a state"} /><span>{isChinese ? "6 個階段中已有 4 個回傳狀態" : "4 of 6 stages have returned a state"}</span></div>
        </div>
        <div className="collector-list" aria-live="polite" aria-label={isChinese ? "掃描來源狀態" : "Scan collector status"}>
          {collectors.map((collector) => <article key={collector.name}><span className={`collector-icon collector-${collector.state}`}>{collector.state === "measured" ? <Check /> : collector.state === "unavailable" ? <CircleAlert /> : <RefreshCw />}</span><div><h2>{collector.name}</h2><p>{collector.detail}</p></div><ProviderBadge state={collector.state} locale={locale} /></article>)}
        </div>
        <div className="partial-result-card"><div><FactType type="Observed" /><h2>{isChinese ? "示範報告已準備好" : "A sample report is ready"}</h2><p>{isChinese ? `已保留你的掃描對象「${business}」。此審閱版本不會執行即時收集；下一頁會清楚分開你的要求與錦汶館示範證據。` : `Your requested business, “${business}”, is retained. This review build does not run live collection; the next page separates your request from the Kam Man House sample evidence.`}</p></div><Button asChild><Link href={`/${locale}/r/demo-kam-man-house?business=${encodeURIComponent(business)}&market=${requestedMarket === "tw" ? "tw" : "hk"}`}>{isChinese ? "查看示範報告" : "View sample report"} <ArrowRight /></Link></Button></div>
        <div className="recovery-grid"><SectionCard><Link2 /><h2>{isChinese ? "儲存返回連結" : "Save this recovery link"}</h2><p>{isChinese ? "不用重新開始，便可返回這次掃描。正式產品的背景完成與通知需得到同意並設定送達方式。" : "Return to this exact scan without starting again. In production, background completion and notification require consent and configured delivery."}</p><Button variant="outline" onClick={() => navigator.clipboard?.writeText(window.location.href)}>{isChinese ? "複製返回連結" : "Copy recovery link"}</Button></SectionCard><SectionCard><RefreshCw /><h2>{isChinese ? "來源暫時未能取得" : "Provider unavailable"}</h2><p>{isChinese ? "Instagram 證據沒有回傳。重試不會刪除已收集的證據。" : "Instagram evidence did not return. Retrying will not erase the evidence already collected."}</p><Button variant="outline" onClick={() => setRetried(true)} disabled={retried}>{isChinese ? (retried ? "重試已完成" : "只重試 Instagram") : (retried ? "Retry completed" : "Retry Instagram only")}</Button></SectionCard></div>
      </main>
    </PublicPageFrame>
  )
}

export function ReportPage({ locale, sample = false, requestedBusiness, requestedMarket }: { locale: PrototypeLocale; sample?: boolean; requestedBusiness?: string; requestedMarket?: string }) {
  const top = actions.slice(0, 3)
  const isChinese = locale !== "en"
  const actionLabels: Record<string, { title: string; summary: string; reason: string }> = {
    "review-response": { title: "回覆 7 則未回覆的 Google 評論", summary: "7 則近期顧客評論仍等待店主回覆。", reason: "最新退步 · 高意向接觸點 · 草稿已準備" },
    "social-post": { title: "處理 Instagram 16 日內容空檔", summary: "最近可取得的公開帖文距今 16 日。", reason: "內容新鮮度下降 · 所需資料已齊" },
    "private-dining-faq": { title: "新增私人宴會常見問題", summary: "網站未有清楚交代私人宴會的基本查詢。", reason: "高意向問題 · 可由現有商戶資料安全擬稿" },
  }
  const providerZh: Record<string, { name: string; value: string; detail: string }> = {
    "Google Business & Maps": { name: "Google 商戶與地圖", value: "回覆率 18%", detail: "7 則近期評論沒有店主回覆。" },
    "Public website": { name: "公開網站", value: "15 項中通過 12 項", detail: "餐牌及營業時間可讀；常見問題覆蓋有限。" },
    "Google Search & AI surfaces": { name: "Google 搜尋與 AI 版面", value: "5 個查詢中出現 2 次", detail: "商戶在地圖及一次 AI Overview 出現；其餘 3 個可比較查詢沒有出現。" },
    "Instagram public evidence": { name: "Instagram 公開證據", value: "不計分", detail: "來源未能提供完整公開快照，因此不會降低評分。" },
  }
  return (
    <PublicPageFrame locale={locale}>
      <main className="report-page">
        {!sample && requestedBusiness && <div className="request-context-banner" role="status"><Search /><div><strong>{isChinese ? `你的掃描要求：${requestedBusiness}` : `Your scan request: ${requestedBusiness}`}</strong><span>{isChinese ? `已保留商戶及${requestedMarket === "tw" ? "台灣" : "香港"}市場設定。以下內容仍是清楚標示的「錦汶館」示範證據，並非為你的商戶完成的即時掃描。` : `The business and ${requestedMarket === "tw" ? "Taiwan" : "Hong Kong"} market context are retained. The evidence below remains the clearly labelled Kam Man House demo—not a live result for your business.`}</span></div><DemoBadge locale={locale} /></div>}
        <div className="report-title-row"><div><Badge variant="outline">{isChinese ? (sample ? "已去除敏感資料的示範報告" : "安全證據公開預覽") : (sample ? "Sanitised sample report" : "Evidence-safe public preview")}</Badge><h1>{merchant.name} {isChinese ? "能見度報告" : "visibility report"}</h1><p>{isChinese ? "香港市場 · scan_kmh_20260825 · 觀察於 2026 年 8 月 25 日 09:42 HKT · 示範證據" : "Hong Kong market · scan_kmh_20260825 · Observed 25 Aug 2026, 09:42 HKT · Sample evidence"}</p></div><div className="report-title-badges"><DemoBadge locale={locale} /><Badge variant="outline">{isChinese ? "部分證據" : "Partial evidence"}</Badge><ContextualAssistant locale={locale} surface="report" /></div></div>
        <LoopRibbon active={sample ? 2 : 1} />
        <section className="report-score-panel">
          <ScoreDial score={62} coverage={78} delta={-4} />
          <div className="score-explanation"><FactType type="Observed" /><h2>{isChinese ? "可比較掃描顯示能見度轉弱" : "Visibility weakened on a comparable scan"}</h2><p>{isChinese ? "兩次合資格掃描之間，評分由 66 降至 62。4 個主要來源中有 3 個已量度；未能取得的 Instagram 證據被排除，不會當成表現欠佳。" : "The score moved from 66 to 62 across two eligible scans. Three of four primary sources were measured; unavailable Instagram evidence was excluded rather than counted as poor performance."}</p><div className="score-meta-grid"><div><span>{isChinese ? "已量度" : "Measured"}</span><strong>{isChinese ? "3 個來源" : "3 sources"}</strong></div><div><span>{isChinese ? "未能取得" : "Unavailable"}</span><strong>{isChinese ? "1 個來源" : "1 source"}</strong></div><div><span>{isChinese ? "比較資格" : "Comparison"}</span><strong>{isChinese ? "合資格" : "Eligible"}</strong></div></div><Link href={`/${locale}/methodology`}>{isChinese ? "了解評分方法" : "How this was measured"} <ArrowRight /></Link></div>
        </section>

        <section className="report-section"><div className="section-heading-inline"><div><p className="eyebrow">{isChinese ? "清楚排序，不製造雜訊" : "Priority, not noise"}</p><h2>{isChinese ? "3 項有證據支持的優先行動" : "Top three evidence-backed actions"}</h2></div><Badge variant="outline">{isChinese ? "按新鮮度、影響及準備程度排序" : "Ranked by freshness, impact and readiness"}</Badge></div><div className="priority-report-grid">{top.map((action, index) => { const zh = actionLabels[action.id]; return <article key={action.id}><div className="priority-rank">0{index + 1}</div><div className="priority-card-head"><Badge variant="outline" className={`priority-${action.priority.toLowerCase()}`}>{isChinese ? (index === 0 ? "緊急" : "高") : action.priority}</Badge><span>{action.effort}</span></div><h3>{isChinese && zh ? zh.title : action.title}</h3><p>{isChinese && zh ? zh.summary : action.summary}</p><div className="evidence-excerpt"><FactType type="Observed" /><strong>{isChinese ? (providerZh[action.source]?.name ?? action.source) : action.source}</strong><span>{isChinese && index === 0 ? "回覆率由 31% 降至 18%；本地比較值為 61%。" : action.evidence}</span><small>{isChinese ? "觀察於 2026 年 8 月 25 日 · 示範" : action.observedAt}</small></div><div className="recommendation-line"><FactType type="Recommended" /><span>{isChinese && zh ? zh.reason : action.reason}</span></div></article> })}</div></section>

        <section className="report-agent-handoff"><div><p className="eyebrow">{isChinese ? "Visibility Operator 如何接手" : "How the Visibility Operator takes it forward"}</p><h2>{isChinese ? "先解釋證據及限制，再調度合適能力準備新版本。" : "It explains the evidence and limits, then routes the right capability to prepare a new version."}</h2></div><ol>{(isChinese ? ["解釋：分開不同 scan snapshot", "證據：引用來源及觀察時間", "建議：只選一項首要行動", "草稿：預覽但不批准或發佈"] : ["Explain: separate scan snapshots", "Evidence: cite source and observed time", "Recommend: choose one priority", "Draft: preview without approval or publishing"]).map((item, index) => <li key={item}><span>{index < 3 ? <Check /> : 4}</span><strong>{item}</strong></li>)}</ol><div><ShieldCheck /><span>{isChinese ? "示範報告沒有虛假『批准』按鈕；不會自動對外發佈。" : "This sample report has no fake approval control and nothing is auto-published."}</span><div className="report-handoff-actions"><ContextualAssistant locale={locale} surface="report" /><Button asChild><Link href={`/${locale}/scan`}>{isChinese ? "以我的商戶免費掃描" : "Scan my business for free"}<ArrowRight /></Link></Button></div></div></section>

        <section className="report-section"><div className="section-heading-inline"><div><p className="eyebrow">{isChinese ? "證據護照" : "Evidence passport"}</p><h2>{isChinese ? "來源覆蓋範圍與限制" : "Source coverage and limitations"}</h2></div><Link href={`/${locale}/methodology`}>{isChinese ? "完整評分方法" : "Full methodology"}</Link></div><div className="evidence-passport">{providers.map((provider) => { const zh = providerZh[provider.name]; return <article key={provider.name}><div><h3>{isChinese && zh ? zh.name : provider.name}</h3><p>{isChinese && zh ? zh.detail : provider.detail}</p><small>{isChinese ? "2026 年 8 月 25 日 · 香港時間 · 示範" : provider.observedAt}</small></div><div className="evidence-passport-value"><strong>{isChinese && zh ? zh.value : provider.value}</strong><ProviderBadge state={provider.state} locale={locale} /></div></article> })}</div></section>

        <section className="unlock-banner"><div><LockKeyhole /><div><p className="eyebrow">{isChinese ? "安全延續店主工作" : "Secure owner continuation"}</p><h2>{isChinese ? "將這份報告變成持續行動工作台" : "Turn this report into a recurring action workspace"}</h2><p>{isChinese ? "安全解鎖完整證據、認領商戶、審閱已準備工作，並在下次可比較掃描回來查看成效。" : "Unlock owner-safe evidence, claim the business, review prepared work and return after the next comparable scan."}</p></div></div><Button asChild size="lg"><Link href={`/${locale}/unlock/demo-kam-man-house`}>{isChinese ? "解鎖並認領" : "Unlock and claim"} <ArrowRight /></Link></Button></section>
      </main>
    </PublicPageFrame>
  )
}

export function UnlockPage({ locale }: { locale: PrototypeLocale }) {
  const isChinese = locale !== "en"
  const router = useRouter()
  const [delivery, setDelivery] = useState(false)
  const [discussion, setDiscussion] = useState(false)
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  function continueClaim() {
    if (!email.includes("@") || !delivery) { setError(isChinese ? "請輸入有效電郵並同意安全送達報告。" : "Enter a valid email and consent to secure report delivery."); return }
    router.push(`/${locale}/owner/sign-in?claim=demo-kam-man-house`)
  }
  return (
    <PublicPageFrame locale={locale}>
      <main className="unlock-page">
        <section className="unlock-context"><Badge variant="outline">{isChinese ? "報告" : "Report"} DEMO-247</Badge><h1>{isChinese ? "解鎖完整報告並驗證擁有權" : "Unlock the full report and verify ownership"}</h1><p>{isChinese ? "報告存取與認領商戶是兩個獨立安全步驟。公開分享連結永遠不會授予店主專屬證據或工作台權限。" : "Report access and business claiming are separate security steps. A public share link never grants owner-only evidence or workspace authority."}</p><div className="unlock-benefits"><div><Eye /><span><strong>{isChinese ? "完整證據" : "Full evidence"}</strong><small>{isChinese ? "安全摘要、時間及限制" : "Safe excerpts, timestamps and limitations"}</small></span></div><div><UserCheck /><span><strong>{isChinese ? "認領擁有權" : "Ownership claim"}</strong><small>{isChinese ? "正式產品需要不可偽造的證明" : "Unforgeable evidence required in production"}</small></span></div><div><ListChecks /><span><strong>{isChinese ? "第一項行動" : "First action"}</strong><small>{isChinese ? "已準備工作在審批前仍是草稿" : "Prepared work remains a draft until approval"}</small></span></div></div></section>
        <section className="unlock-form-card">
          <DemoBadge locale={locale} />
          <h2>{isChinese ? "安全送達報告" : "Secure report delivery"}</h2><p>{isChinese ? "此原型不會真的寄出電郵或建立正式帳戶。" : "This prototype does not send email or create a production account."}</p>
          {error && <div className="form-error" role="alert"><CircleAlert />{error}</div>}
          <div className="field-stack"><Label htmlFor="unlock-email">{isChinese ? "店主或經理電郵" : "Owner or manager email"}</Label><div className="input-with-icon"><Mail /><Input id="unlock-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError("") }} placeholder="owner@business.com" /></div></div>
          <Label className="consent-row" htmlFor="delivery-consent"><Checkbox id="delivery-consent" checked={delivery} onCheckedChange={(value) => { setDelivery(Boolean(value)); setError("") }} /><span><strong>{isChinese ? "安全送達此報告" : "Deliver this report securely"}</strong><small>{isChinese ? "我同意使用此電郵作報告存取及擁有權驗證。" : "I consent to use this email for report access and ownership verification."}</small></span></Label>
          <Label className="consent-row" htmlFor="discussion-consent"><Checkbox id="discussion-consent" checked={discussion} onCheckedChange={(value) => setDiscussion(Boolean(value))} /><span><strong>{isChinese ? "與 Fimmick 討論發現" : "Discuss the findings with Fimmick"}</strong><small>{isChinese ? "選填，並與報告送達分開。" : "Optional and separate from report delivery."}</small></span></Label>
          <Button onClick={continueClaim} size="lg" className="w-full">{isChinese ? "前往店主登入" : "Continue to owner sign in"} <ArrowRight /></Button>
          <p className="privacy-note"><LockKeyhole /> {isChinese ? "不會綑綁推廣同意。資料保留與刪除規則見私隱摘要。" : "Marketing consent is not bundled. Retention and deletion rules are explained in the privacy summary."}</p>
        </section>
      </main>
    </PublicPageFrame>
  )
}

export function PricingPage({ locale }: { locale: PrototypeLocale }) {
  const isChinese = locale !== "en"
  const isTaiwan = locale === "zh-TW"
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
      price: "HK$888",
      cadence: "／月",
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
      price: "HK$1,988",
      cadence: "／月",
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
      price: "HK$6,800",
      cadence: " 起／月",
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
      key: "growth", label: "Best for one location", title: "Growth Workspace", price: "HK$888", cadence: " / month", description: "For a small team that wants recurring improvement without managing a bundle of AI tools.", meta: "1 location · 2 users", features: ["12 approved deliveries per month", "Scheduled comparable rescans", "Complete AI Visibility Team", "Versions, owner approval and proof"], cta: "Start Growth", href: `/${locale}/owner/sign-in?plan=growth`, featured: true,
    },
    {
      key: "multi", label: "Up to 3 locations", title: "Multi-location", price: "HK$1,988", cadence: " / month", description: "One priority, approval and improvement rhythm across multiple business locations.", meta: "Includes 3 locations", features: ["36 pooled approved deliveries per month", "Cross-location prioritisation", "Location-scoped evidence and approvals", "Combined and per-location outcomes"], cta: "Manage multiple locations", href: `/${locale}/owner/sign-in?plan=multi`, featured: false,
    },
    {
      key: "managed", label: "Human-managed", title: "Managed Visibility", price: "HK$6,800", cadence: "+ / month", description: "Human execution, quality review and outcome support—not unattended auto-publishing.", meta: "3-month minimum", features: ["Consultant review and execution support", "Channel and location delivery plan", "The same workspace and audit trail", "Owner keeps final approval"], cta: "Learn about managed service", href: `/${locale}/trust`, featured: false,
    },
  ]
  return (
    <PublicPageFrame locale={locale}>
      <main className="content-page pricing-page">
        <header className="content-page-intro"><Badge variant="outline">{isChinese ? (isTaiwan ? "目前顯示香港方向性測試方案 · HKD" : "香港方向性測試方案 · HKD") : "Directional Hong Kong pilot plans · HKD"}</Badge><h1>{isChinese ? "不是一堆 AI 工具，而是一隊替你推進改善的團隊。" : "Not a bundle of AI tools. One team that moves improvement forward."}</h1><p>{isChinese ? "由一次免費證據掃描開始；需要持續監察、草稿與審批時升級工作台，多地點或需要專人支援時再按業務規模擴展。" : "Start with a free evidence scan, add a workspace for recurring monitoring and approvals, then scale by locations or add human-managed support."}</p></header>
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
        <SectionCard className="pricing-usage-banner"><FileCheck2 /><div><p className="eyebrow">{isChinese ? "核准後交付，不是代幣" : "Approved deliveries, not tokens"}</p><h2>{isChinese ? "只有指定版本獲核准並首次成功匯出或發佈，才計 1 次交付。" : "One delivery is counted only after an exact version is approved and first exported or published."}</h2><p>{isChinese ? "查看證據、優先排序、重新掃描、生成、修改、退回、拒絕或執行失敗都不扣除用量。所有 Workspace 方案都包括安全檢查、店主審批、活動紀錄及可還原路徑。" : "Evidence, prioritisation, rescans, generation, revisions, returns, rejections and failed runs use no allowance. Safety checks, owner approval, activity history and recovery are included in every Workspace plan."}</p></div></SectionCard>
        <SectionCard className="pricing-faq"><div><p className="eyebrow">{isChinese ? "簡單選擇" : "Simple choices"}</p><h2>{isChinese ? "我應選哪個方案？" : "Which plan fits?"}</h2><p>{isChinese ? "先免費掃描。單一地點可由增長工作台開始；第 2 或第 3 個地點出現時才考慮多地點。需要專人推進時，再選專人服務。" : "Start free. Choose Growth for one location, Multi-location when a second or third location appears, and Managed when you need human execution."}</p></div><div><h3>{isChinese ? "內容會自動發佈嗎？" : "Will content auto-publish?"}</h3><p>{isChinese ? "不會。每次匯出或發佈前都需要正確權限及明確店主審批；專人服務亦不例外。" : "No. Every export or publish step requires the right permission and an explicit owner approval, including Managed Visibility."}</p></div><div><h3>{isChinese ? "這是正式價格嗎？" : "Is this final pricing?"}</h3><p>{isChinese ? "不是。以上為香港市場方向性測試價格，付款尚未在此原型連接。介面語言與市場、貨幣分開設定。" : "No. These are directional Hong Kong test prices and checkout is not connected in this prototype. Interface language is separate from market and currency."}</p></div></SectionCard>
      </main>
    </PublicPageFrame>
  )
}

export function MethodologyPage({ locale }: { locale: PrototypeLocale }) {
  const isChinese = locale !== "en"
  return (
    <PublicPageFrame locale={locale}>
      <main className="content-page methodology-page">
        <header className="content-page-intro"><Badge variant="outline">{isChinese ? "2.0 版本 · 原型合約" : "Version 2.0 · Prototype contract"}</Badge><h1>{isChinese ? "如何處理證據、覆蓋範圍及可比較變化" : "How evidence, coverage and comparable change are handled"}</h1><p>{isChinese ? "評分只協助作決定，不是收入證明，亦不能取代原始證據。" : "The score is a decision aid, not proof of revenue or a substitute for the source evidence."}</p></header>
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
        <header className="content-page-intro"><Badge variant="outline">{isChinese ? "安全、私隱與人工控制" : "Security, privacy and human control"}</Badge><h1>{isChinese ? "一個身份、一條權限界線、一份審計紀錄" : "One identity, one permission boundary, one audit trail"}</h1><p>{isChinese ? "此原型示範預期體驗。正式控制仍由 SME Scanner 正式系統、伺服器路由及資料庫政策強制執行。" : "The prototype demonstrates the intended experience. Production controls remain enforced by the SME Scanner runtime, its server routes and database policies."}</p></header>
        <div className="trust-pillar-grid">{pillars.map(({ icon: Icon, title, body }) => <article key={title}><span><Icon /></span><h2>{title}</h2><p>{body}</p></article>)}</div>
        <div className="method-layout"><SectionCard><p className="eyebrow">{isChinese ? "審批合約" : "Approval contract"}</p><h2>{isChinese ? "對外送達是獨立狀態轉換" : "External delivery is a separate transition"}</h2><ol className="number-list"><li><span>1</span><div><strong>{isChinese ? "準備" : "Prepare"}</strong><p>{isChinese ? "輸入按範圍限制，不受信任內容只會當成資料，不會當成指令。" : "Inputs are scoped and untrusted content is treated as data, not instruction."}</p></div></li><li><span>2</span><div><strong>{isChinese ? "審閱一個版本" : "Review a version"}</strong><p>{isChinese ? "編輯已批准版本會建立新草稿並重設審批。" : "Editing an approved version creates a new draft and resets approval."}</p></div></li><li><span>3</span><div><strong>{isChinese ? "確認目標" : "Confirm the target"}</strong><p>{isChinese ? "送達需要獲授權角色、正確連接範圍、冪等處理及可復原失敗路徑。" : "Delivery requires an authorised role, connected scope, idempotency and recoverable failure handling."}</p></div></li></ol></SectionCard><SectionCard><p className="eyebrow">{isChinese ? "原型資料界線" : "Prototype data boundary"}</p><h2>{isChinese ? "不包含正式秘密或客戶紀錄" : "No production secrets or customer records"}</h2><dl className="trust-dl"><div><dt>{isChinese ? "包含" : "Included"}</dt><dd>{isChinese ? "1 個示範商戶、2 個地點、示範掃描、行動及草稿版本。" : "One demo merchant, two locations, sample scans, actions and draft versions."}</dd></div><div><dt>{isChinese ? "不包含" : "Not included"}</dt><dd>{isChinese ? "即時憑證、OAuth 代幣、付款資料、真實評論或私人證據。" : "Live credentials, OAuth tokens, payment details, real reviews or private evidence."}</dd></div><div><dt>{isChinese ? "保留" : "Persistence"}</dt><dd>{isChinese ? "只保留無害的當次原型狀態。" : "Harmless in-session prototype state only."}</dd></div></dl></SectionCard></div>
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

export function OnboardingPage({ locale, claim, plan, initialLocation }: { locale: PrototypeLocale; claim?: string; plan?: string; initialLocation?: string }) {
  const router = useRouter()
  const isChinese = locale !== "en"
  const [step, setStep] = useState(1)
  const [workspaceName, setWorkspaceName] = useState("錦汶館")
  const [location, setLocation] = useState(initialLocation === "tin-hau" ? "tin-hau" : "yik-yam")
  const steps = isChinese ? ["驗證認領", "設定工作台", "連接來源", "品牌基本資料"] : ["Verify claim", "Set workspace", "Connections", "Brand basics"]
  const body = useMemo(() => {
    if (step === 1) return <div className="onboarding-choice"><span className="onboarding-icon"><BadgeCheck /></span><div><Badge variant="outline">{isChinese ? "示範認領證據" : "Sample claim evidence"}</Badge><h2>{isChinese ? "確認錦汶館" : "Confirm 錦汶館"}</h2><p>{isChinese ? "香港跑馬地奕蔭街 8 號" : "8 Yik Yam Street, Happy Valley · Hong Kong"}</p><dl><div><dt>{isChinese ? "認領方式" : "Claim method"}</dt><dd>{isChinese ? "正式產品需要驗證" : "Production verification required"}</dd></div><div><dt>{isChinese ? "公開報告" : "Public report"}</dt><dd>DEMO-247</dd></div></dl></div></div>
    if (step === 2) return <div className="onboarding-form"><div className="field-stack"><Label htmlFor="workspace-name">{isChinese ? "工作台名稱" : "Workspace name"}</Label><Input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></div><div className="field-stack"><Label htmlFor="primary-location">{isChinese ? "主要地點" : "Primary location"}</Label><Select value={location} onValueChange={setLocation}><SelectTrigger id="primary-location" className="w-full"><SelectValue>{location === "tin-hau" ? (isChinese ? "天后" : "Tin Hau") : (isChinese ? "奕蔭街" : "Yik Yam Street")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="yik-yam">{isChinese ? "奕蔭街" : "Yik Yam Street"}</SelectItem><SelectItem value="tin-hau">{isChinese ? "天后" : "Tin Hau"}</SelectItem></SelectContent></Select></div><div className="two-column-fields"><div className="field-stack"><Label htmlFor="onboarding-market">{isChinese ? "市場" : "Market"}</Label><Input id="onboarding-market" defaultValue={isChinese ? "香港" : "Hong Kong"} readOnly /></div><div className="field-stack"><Label htmlFor="onboarding-timezone">{isChinese ? "時區" : "Timezone"}</Label><Input id="onboarding-timezone" defaultValue="Asia/Hong_Kong" readOnly /></div></div></div>
    if (step === 3) return <div className="connection-choice"><div><span><Globe2 /></span><div><h3>Google Business Profile</h3><p>{isChinese ? "讀取商戶檔案及評論證據；不會啟用直接發佈。" : "Read profile and review evidence. Direct publishing is not enabled."}</p></div><CapabilityBadge value="Requires connection" /></div><Button variant="outline" disabled>{isChinese ? "在正式環境設定" : "Set up in production"}</Button><button className="text-action" type="button" onClick={() => setStep(4)}>{isChinese ? "暫時略過並只保留匯出" : "Skip for now and keep export-only"}</button></div>
    return <div className="onboarding-form"><div className="field-stack"><Label htmlFor="onboarding-voice">{isChinese ? "品牌語氣" : "Brand voice"}</Label><Select defaultValue="warm"><SelectTrigger id="onboarding-voice" className="w-full"><SelectValue>{isChinese ? "親切、本地、真誠" : "Warm, local and sincere"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="warm">{isChinese ? "親切、本地、真誠" : "Warm, local and sincere"}</SelectItem><SelectItem value="concise">{isChinese ? "簡潔、專業" : "Concise and professional"}</SelectItem><SelectItem value="playful">{isChinese ? "活潑、有活力" : "Playful and energetic"}</SelectItem></SelectContent></Select></div><div className="field-stack"><Label htmlFor="approved-fact">{isChinese ? "已核准事實描述" : "Approved factual claim"}</Label><Input id="approved-fact" defaultValue={isChinese ? "跑馬地港式家常菜" : "Hong Kong-style comfort food in Happy Valley"} /></div><div className="field-stack"><Label htmlFor="prohibited-language">{isChinese ? "禁止用語" : "Prohibited terms"}</Label><Input id="prohibited-language" defaultValue={isChinese ? "全港最好、保證、絕對防敏" : "best in Hong Kong, guaranteed, allergy-safe"} /></div><p className="limitation-note"><TriangleAlert /> {isChinese ? "餐牌材料、致敏原、價格及法律聲明必須由店主確認。" : "Menu ingredients, allergens, prices and legal claims always require owner confirmation."}</p></div>
  }, [isChinese, location, step, workspaceName])
  return (
    <PublicPageFrame locale={locale}>
      <main className="onboarding-page"><div className="onboarding-head"><div><Badge variant="outline">{isChinese ? "延續認領流程" : "Claim continuation"}{claim ? ` · ${claim}` : ""}</Badge><h1>{isChinese ? "設定你的能見度工作台" : "Set up your visibility workspace"}</h1><p>{isChinese ? "4 個聚焦步驟，將市場、語言及權限分開設定。" : "Four focused steps, with market, language and permissions kept separate."}</p>{plan && <Badge>{isChinese ? "已保留所選方案" : "Selected plan preserved"} · {plan === "multi" ? (isChinese ? "多地點" : "Multi-location") : (isChinese ? "增長工作台" : "Growth Workspace")}</Badge>}</div><DemoBadge locale={locale} /></div><div className="onboarding-layout"><aside><ol>{steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={step === index + 1 ? "is-active" : step > index + 1 ? "is-complete" : ""}><span>{step > index + 1 ? <Check /> : index + 1}</span><strong>{label}</strong></li>)}</ol></aside><section className="onboarding-card" aria-live="polite"><div><span className="step-kicker">{isChinese ? `第 ${step} 步，共 4 步` : `Step ${step} of 4`}</span><h2>{steps[step - 1]}</h2></div>{body}<div className="flow-card-footer"><Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>{isChinese ? "返回" : "Back"}</Button><Button onClick={() => { if (step === 2 && !workspaceName.trim()) return; if (step < 4) setStep(step + 1); else router.push(`/${locale}/owner/kam-man-house?location=${location}`) }}>{isChinese ? (step < 4 ? "繼續" : "開啟工作台") : (step < 4 ? "Continue" : "Open workspace")}<ArrowRight /></Button></div></section></div></main>
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
