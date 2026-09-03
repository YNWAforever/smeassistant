"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  FileClock,
  FileText,
  Home,
  Layers3,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  PlusCircle,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  WandSparkles,
  X,
} from "lucide-react"
import { useEffect, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { copy, normaliseLocale, supportedLocales, type PrototypeLocale } from "@/lib/copy"
import type { Capability, ProviderState } from "@/lib/demo-data"
import { ContextualAssistant, type AssistantSurface } from "@/components/pocket-assistant/assistant-sheet"

/**
 * Demo-surface only (CLAUDE.md §5 "Global"): /sample-report, /demo-workspace and
 * workspaces with `is_demo`. `show` defaults to false so every production surface
 * renders no bar; the markup and the `.prototype-bar` CSS are unchanged.
 */
export function EnvironmentBar({ locale, show = false }: { locale: PrototypeLocale; show?: boolean }) {
  const bar = copy[locale].funnel.demoBar
  if (!show) return null
  return (
    <div className="prototype-bar" role="status" aria-label={`${bar.title}, ${bar.body}`}>
      <span className="prototype-dot" aria-hidden="true" />
      <strong>{bar.title}</strong>
      <span aria-hidden="true">·</span>
      <span>{bar.body}</span>
      <span className="ml-auto hidden sm:inline">{bar.note}</span>
    </div>
  )
}

export function CapabilityBadge({ value }: { value: Capability }) {
  const pathname = usePathname()
  const locale = normaliseLocale(pathname.split("/").filter(Boolean)[0])
  const className = {
    Live: "cap-live",
    Beta: "cap-beta",
    Demo: "cap-demo",
    "Requires connection": "cap-connection",
    Planned: "cap-planned",
  }[value]
  return (
    <Badge variant="outline" className={className}>
      {locale === "en" ? value : ({ Live: "已啟用", Beta: "測試版", Demo: "示範", "Requires connection": "需要連接", Planned: "計劃中" } as Record<Capability, string>)[value]}
    </Badge>
  )
}

export function ProviderBadge({ state, locale = "en" }: { state: ProviderState; locale?: PrototypeLocale }) {
  const t = copy[locale].common
  const labels: Record<ProviderState, string> = {
    measured: t.measured,
    unavailable: t.unavailable,
    unsupported: t.unsupported,
    failed: t.failed,
    pending: t.pending,
  }
  const icons: Record<ProviderState, ReactNode> = {
    measured: <Check aria-hidden="true" />,
    unavailable: <CircleDashed aria-hidden="true" />,
    unsupported: <X aria-hidden="true" />,
    failed: <CircleAlert aria-hidden="true" />,
    pending: <CircleDashed aria-hidden="true" />,
  }
  return (
    <Badge variant="outline" className={`provider-${state}`}>
      {icons[state]}
      {labels[state]}
    </Badge>
  )
}

export function DemoBadge({ locale = "en" }: { locale?: PrototypeLocale }) {
  return <Badge className="demo-badge">{copy[locale].common.demo}</Badge>
}

export function ScoreDial({ score, coverage, delta }: { score: number; coverage: number | null; delta?: number }) {
  const pathname = usePathname()
  const locale = normaliseLocale(pathname.split("/").filter(Boolean)[0])
  const isChinese = locale !== "en"
  return (
    <div className="score-dial-wrap">
      <div
        className="score-dial"
        style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}
        role="img"
        aria-label={isChinese ? `能見度評分 ${score} 分（滿分 100）。${coverage == null ? "" : `覆蓋率 ${coverage}%。`}${typeof delta === "number" ? `可比較變化 ${delta}。` : ""}` : `Visibility score ${score} out of 100.${coverage == null ? "" : ` Coverage ${coverage} percent.`}${typeof delta === "number" ? ` Change ${delta}.` : ""}`}
      >
        <div className="score-dial-core">
          <span className="score-number">{score}</span>
          <span className="score-label">/ 100</span>
        </div>
      </div>
      <div className="score-dial-meta">
        {coverage != null && <strong>{coverage}% {isChinese ? "覆蓋率" : "coverage"}</strong>}
        {typeof delta === "number" && (
          <span className={delta < 0 ? "delta-down" : "delta-up"}>
            {delta > 0 ? "+" : ""}{delta} {isChinese ? "（自上次可比較掃描）" : "since comparable scan"}
          </span>
        )}
      </div>
    </div>
  )
}

const loopSteps = ["Discover", "Diagnose", "Prioritise", "Draft", "Approve", "Export", "Re-scan", "Prove change"]
const loopStepsZh = ["發現", "診斷", "排序", "擬稿", "審批", "匯出／發佈", "重新掃描", "證明改善"]

export function LoopRibbon({ active = 0 }: { active?: number }) {
  const pathname = usePathname()
  const locale = normaliseLocale(pathname.split("/").filter(Boolean)[0])
  const steps = locale === "en" ? loopSteps : loopStepsZh
  return (
    <ol className="loop-ribbon" aria-label={locale === "en" ? "Visibility improvement loop" : "能見度改善循環"}>
      {steps.map((step, index) => (
        <li key={step} className={index === active ? "is-active" : index < active ? "is-done" : ""}>
          <span className="loop-index">{index < active ? <Check aria-hidden="true" /> : index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}

function LocaleSelect({ locale }: { locale: PrototypeLocale }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  function changeLocale(nextLocale: string) {
    const parts = pathname.split("/").filter(Boolean)
    if (supportedLocales.includes(parts[0] as PrototypeLocale)) parts[0] = nextLocale
    else parts.unshift(nextLocale)
    const query = searchParams.toString()
    const hash = typeof window === "undefined" ? "" : window.location.hash
    router.push(`/${parts.join("/")}${query ? `?${query}` : ""}${hash}`)
  }
  return (
    <Select value={locale} onValueChange={changeLocale}>
      <SelectTrigger className="locale-trigger" aria-label={locale === "en" ? "Language" : "介面語言"}>
        <SelectValue>{copy[locale].language}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {supportedLocales.map((item) => (
          <SelectItem key={item} value={item}>{copy[item].language}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function PublicHeader({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale]
  const isChinese = locale !== "en"
  return (
    <header className="public-header">
      <div className="public-header-inner">
        <Link className="brand-lockup" href={`/${locale}`} aria-label={isChinese ? "SME Scanner 主頁" : "SME Scanner home"}>
          <span className="brand-mark" aria-hidden="true"><Search /></span>
          <span>
            <strong>SME Scanner</strong>
            <small>by Fimmick</small>
          </span>
        </Link>
        <nav className="public-nav" aria-label={isChinese ? "網站導覽" : "Public navigation"}>
          <Link href={`/${locale}#why-sme-scanner`}>{isChinese ? "產品優勢" : "Why us"}</Link>
          <Link href={`/${locale}#sample-case`}>{isChinese ? "示範案例" : "Sample case"}</Link>
          <Link href={`/${locale}/pricing`}>{t.nav.pricing}</Link>
          <Link href={`/${locale}/trust`}>{t.nav.trust}</Link>
        </nav>
        <div className="header-actions">
          <LocaleSelect locale={locale} />
          <Button asChild variant="outline" className="hidden lg:inline-flex">
            <Link href={`/${locale}/owner/sign-in`}>{t.nav.signIn}</Link>
          </Button>
          <Button asChild className="header-scan-cta hidden md:inline-flex">
            <Link href={`/${locale}/scan`}>{isChinese ? "免費掃描" : "Free scan"}<ArrowRight /></Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="public-menu-trigger" aria-label={isChinese ? "開啟選單" : "Open menu"}><Menu /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(92vw,22rem)]">
              <SheetHeader>
                <SheetTitle>SME Scanner</SheetTitle>
                <SheetDescription>{isChinese ? "以證據為先的能見度管理" : "Evidence-first visibility monitoring"}</SheetDescription>
              </SheetHeader>
              <nav className="mobile-sheet-nav" aria-label={isChinese ? "流動版導覽" : "Mobile navigation"}>
                <Link href={`/${locale}/scan`}>{t.nav.scanner}</Link>
                <Link href={`/${locale}#why-sme-scanner`}>{isChinese ? "產品優勢" : "Why us"}</Link>
                <Link href={`/${locale}#sample-case`}>{isChinese ? "示範案例" : "Sample case"}</Link>
                <Link href={`/${locale}/sample-report`}>{t.nav.sample}</Link>
                <Link href={`/${locale}/methodology`}>{t.nav.methodology}</Link>
                <Link href={`/${locale}/pricing`}>{t.nav.pricing}</Link>
                <Link href={`/${locale}/trust`}>{t.nav.trust}</Link>
                <Link href={`/${locale}/owner/sign-in`}>{t.nav.signIn}</Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

const primaryWorkspaceNav: ReadonlyArray<{
  key: string
  label: string
  icon: typeof Home
  suffix: string
  badge?: string
}> = [
  { key: "home", label: "Home", icon: Home, suffix: "" },
  { key: "actions", label: "Actions", icon: FileClock, suffix: "/actions", badge: "3" },
  { key: "create", label: "Create", icon: WandSparkles, suffix: "/create" },
  { key: "insights", label: "Insights", icon: BarChart3, suffix: "/insights" },
]

const secondaryWorkspaceNav = [
  { label: "Assets", icon: Layers3, suffix: "/assets" },
  { label: "Calendar", icon: CalendarDays, suffix: "/calendar" },
  { label: "Activity", icon: Activity, suffix: "/activity" },
  { label: "Brand profile", icon: FileText, suffix: "/settings/brand" },
  { label: "Integrations", icon: Settings2, suffix: "/settings/integrations" },
  { label: "Team & roles", icon: Users, suffix: "/settings/team" },
  { label: "Plan & billing", icon: BadgeCheck, suffix: "/settings/billing" },
] as const

export function WorkspaceShell({ locale, children }: { locale: PrototypeLocale; children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = copy[locale]
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/kam-man-house`
  const location = ["all", "tin-hau", "yik-yam"].includes(searchParams.get("location") ?? "") ? searchParams.get("location")! : "yik-yam"
  const locationName = isChinese ? (location === "all" ? "所有地點" : location === "tin-hau" ? "天后" : "奕蔭街") : (location === "all" ? "All locations" : location === "tin-hau" ? "Tin Hau" : "Yik Yam Street")
  const scopedHref = (href: string) => `${href}${href.includes("?") ? "&" : "?"}location=${location}`
  const workspaceSection = pathname.includes("/actions/")
    ? (isChinese ? "審閱與審批" : "Review & approve")
    : pathname.endsWith("/actions")
      ? (isChinese ? "行動與審批" : "Actions & approvals")
      : pathname.endsWith("/create")
        ? (isChinese ? "建立內容" : "Create")
        : pathname.endsWith("/insights")
          ? (isChinese ? "成效與證明" : "Insights & proof")
          : pathname.includes("/settings/")
            ? (isChinese ? "工作台設定" : "Workspace settings")
            : pathname.endsWith("/assets")
              ? (isChinese ? "素材" : "Assets")
              : pathname.endsWith("/calendar")
                ? (isChinese ? "日曆" : "Calendar")
                : pathname.endsWith("/activity")
                  ? (isChinese ? "活動紀錄" : "Activity")
                  : (isChinese ? "今日焦點" : "Today")
  const labelMap: Record<string, string> = {
    Home: t.nav.home,
    Actions: t.nav.actions,
    Create: t.nav.create,
    Insights: t.nav.insights,
  }
  const secondaryLabelMap: Record<string, string> = isChinese ? {
    Assets: "素材",
    Calendar: "日曆",
    Activity: "活動紀錄",
    "Brand profile": "品牌資料",
    Integrations: "連接與整合",
    "Team & roles": "團隊與權限",
    "Plan & billing": "方案與帳單",
  } : {}
  const assistantSurface: AssistantSurface = pathname.includes("/actions/")
    ? "action"
    : pathname.endsWith("/actions")
      ? "actions"
      : pathname.endsWith("/create")
        ? "create"
        : pathname.endsWith("/insights")
          ? "insights"
          : pathname.endsWith("/assets")
            ? "assets"
            : "home"
  return (
    <SidebarProvider className="workspace-shell">
      <Sidebar collapsible="none" className="workspace-sidebar hidden md:flex">
        <SidebarHeader className="workspace-sidebar-header">
          <Link className="brand-lockup brand-lockup-inverse" href={base}>
            <span className="brand-mark" aria-hidden="true"><Search /></span>
            <span><strong>Visibility</strong><small>Workspace</small></span>
          </Link>
          <Link className="workspace-switcher" href={`/${locale}/owner/select-workspace`} aria-label={isChinese ? "切換工作台或分店" : "Switch workspace or location"}>
            <span className="workspace-avatar">錦</span>
            <span><strong>錦汶館</strong><small>{locationName}</small></span>
            <ChevronDown aria-hidden="true" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{isChinese ? "今日工作" : "Operate"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryWorkspaceNav.map(({ label, icon: Icon, suffix, badge }) => {
                  const href = scopedHref(`${base}${suffix}`)
                  const active = suffix ? pathname.startsWith(href) : pathname === base || pathname === `/${locale}/owner`
                  return (
                    <SidebarMenuItem key={label}>
                      <SidebarMenuButton asChild isActive={active} tooltip={labelMap[label] ?? label}>
                        <Link href={href}><Icon /><span>{labelMap[label] ?? label}</span></Link>
                      </SidebarMenuButton>
                      {badge && <SidebarMenuBadge>{badge}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarSeparator />
          <SidebarGroup>
            <SidebarGroupLabel>{isChinese ? "管理" : "Manage"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {secondaryWorkspaceNav.map(({ label, icon: Icon, suffix }) => {
                  const href = scopedHref(`${base}${suffix}`)
                  return (
                    <SidebarMenuItem key={label}>
                      <SidebarMenuButton asChild isActive={pathname === href}>
                        <Link href={href}><Icon /><span>{secondaryLabelMap[label] ?? label}</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="workspace-sidebar-footer">
          <div className="usage-mini">
            <div><span>{isChinese ? "本月核准後交付" : "Approved deliveries"}</span><strong>5 / 12</strong></div>
            <div className="usage-track"><span style={{ width: "42%" }} /></div>
            <small>{isChinese ? "生成、修改或拒絕均不扣用量" : "Generation, revisions and rejection use no allowance"}</small>
          </div>
          <button className="account-button" type="button">
            <span className="account-avatar">WL</span>
            <span><strong>Willy Lai</strong><small>{isChinese ? "店主" : "Owner"}</small></span>
            <MoreHorizontal aria-hidden="true" />
          </button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-mobile-brand md:hidden">
            <span className="brand-mark" aria-hidden="true"><Search /></span>
            <span><strong>{isChinese ? "能見度工作台" : "Visibility Workspace"}</strong><small>錦汶館 · {locationName}</small></span>
          </div>
          <div className="workspace-topbar-context hidden md:flex" aria-label={isChinese ? `目前區域：${workspaceSection}` : `Current section: ${workspaceSection}`}>
            <span>{isChinese ? "店主工作台" : "Owner workspace"}</span>
            <strong>{workspaceSection}</strong>
          </div>
          <div className="workspace-topbar-spacer" />
          <ContextualAssistant locale={locale} surface={assistantSurface} triggerLabel={isChinese ? "問增長助理" : "Ask operator"} />
          <Button asChild variant="ghost" size="icon" className="notification-button">
            <Link href={`${base}/settings/notifications`} aria-label={isChinese ? "通知，3 則未讀" : "Notifications, three unread"}><Bell /><span className="notification-dot" /></Link>
          </Button>
          <LocaleSelect locale={locale} />
          <DemoBadge locale={locale} />
        </header>
        <main className="workspace-content">{children}</main>
        <nav className="mobile-bottom-nav md:hidden" aria-label={isChinese ? "工作台導覽" : "Workspace navigation"}>
          {primaryWorkspaceNav.map(({ key, label, icon: Icon, suffix }) => {
            const href = scopedHref(`${base}${suffix}`)
            const active = suffix ? pathname.startsWith(href) : pathname === base
            return <Link key={key} href={href} className={active ? "is-active" : ""}><Icon /><span>{labelMap[label] ?? label}</span></Link>
          })}
          <Link href={scopedHref(`${base}/more`)} className={pathname.includes("/more") || pathname.includes("/settings/") ? "is-active" : ""}>
            <MoreHorizontal /><span>{t.nav.more}</span>
          </Link>
        </nav>
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * `demo` renders the EnvironmentBar and adds the `has-env-bar` hook the CSS
 * offsets are gated behind (CLAUDE.md §5 "Global"); it is false everywhere else.
 */
export function PublicPageFrame({ locale, demo = false, children }: { locale: PrototypeLocale; demo?: boolean; children: ReactNode }) {
  const isChinese = locale !== "en"
  const t = copy[locale].funnel.footer
  useEffect(() => {
    document.documentElement.lang = locale === "zh-HK" ? "zh-HK" : locale === "zh-TW" ? "zh-TW" : "en"
  }, [locale])
  return (
    <div className={`public-site${demo ? " has-env-bar" : ""}`}>
      <EnvironmentBar locale={locale} show={demo} />
      <PublicHeader locale={locale} />
      {children}
      <footer className="public-footer">
        <div>
          <div className="brand-lockup"><span className="brand-mark"><Search /></span><span><strong>SME Scanner</strong><small>{t.tagline}</small></span></div>
          <p>{t.body}</p>
          <small>© {new Date().getFullYear()} Fimmick</small>
        </div>
        <nav aria-label={isChinese ? "頁尾導覽" : "Footer navigation"}>
          <Link href={`/${locale}/methodology`}>{isChinese ? "評分方法與限制" : "Methodology & limitations"}</Link>
          <Link href={`/${locale}/trust`}>{isChinese ? "安全與私隱" : "Security & privacy"}</Link>
          <Link href={`/${locale}/pricing`}>{isChinese ? "收費方案" : "Pricing"}</Link>
          <Link href={`/${locale}/legal/privacy`}>{t.privacy}</Link>
          <Link href={`/${locale}/legal/terms`}>{t.terms}</Link>
        </nav>
      </footer>
    </div>
  )
}

export function WorkspacePageFrame({ locale, demo = false, children }: { locale: string; demo?: boolean; children: ReactNode }) {
  const safeLocale = normaliseLocale(locale)
  useEffect(() => {
    document.documentElement.lang = safeLocale === "zh-HK" ? "zh-HK" : safeLocale === "zh-TW" ? "zh-TW" : "en"
  }, [safeLocale])
  return (
    <div className={`workspace-root${demo ? " has-env-bar" : ""}`}>
      <EnvironmentBar locale={safeLocale} show={demo} />
      <WorkspaceShell locale={safeLocale}>{children}</WorkspaceShell>
    </div>
  )
}

export function PageIntro({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-intro">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-intro-actions">{actions}</div>}
    </header>
  )
}

export function FactType({ type }: { type: "Observed" | "Inference" | "Recommended" | "Attributed" | "Estimated" | "Unknown" }) {
  const pathname = usePathname()
  const locale = normaliseLocale(pathname.split("/").filter(Boolean)[0])
  const labels = { Observed: "已觀察", Inference: "推論", Recommended: "建議", Attributed: "可能相關", Estimated: "估算", Unknown: "未知" }
  return <span className={`fact-type fact-${type.toLowerCase()}`}>{locale === "en" ? type : labels[type]}</span>
}

export function SectionCard({ children, className = "", as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "article" | "div" }) {
  return <Tag className={`section-card ${className}`}>{children}</Tag>
}

export const workspaceIcons = {
  home: Home,
  actions: FileClock,
  create: PlusCircle,
  insights: BarChart3,
  more: MoreHorizontal,
  security: ShieldCheck,
  business: Building2,
  lock: LockKeyhole,
  sparkles: Sparkles,
}
