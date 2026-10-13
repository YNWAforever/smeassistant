"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CircleAlert,
  CircleDashed,
  FileClock,
  Home,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  PlusCircle,
  ShieldCheck,
  Sparkles,
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
import { copy, LOCALE_NAMES, LOCALE_SHORT_NAMES, normaliseLocale, supportedLocales, type PrototypeLocale } from "@/lib/copy"
import type { Capability, ProviderState } from "@/lib/demo-data"
import { MotionDirector } from "@/components/motion-director"
import { PublicBrandLink, PublicFooter, PublicNavLinks } from "@/components/public-chrome"
import { zhFor } from "@/lib/zh-tw"

/**
 * Everything the workspace chrome renders about the current workspace
 * (CLAUDE.md Phase 2 item 6). Real pages build it from `loadWorkspaceContext`
 * via `buildShellWorkspace`; the demo and prototype pages pass
 * `demoShellWorkspace` from lib/demo-data.ts. The shell itself carries no
 * workspace literal.
 */
export type ShellWorkspace = {
  slug: string
  name: string
  avatarInitial: string
  locations: Array<{ slug: string; name: string }>
  defaultLocationSlug: string
  usage: { approvedDeliveries: number; allowance: number | null }
  account: { name: string; email: string; roleLabel: string }
  unreadNotifications: number
  demo: boolean
  /** Open urgent actions, shown as the Actions nav badge; omitted or 0 hides it. */
  urgentActions?: number
  /** Real workspaces only: the topbar assistant runs in live mode against these ids (§3.8). Absent on demo/prototype shells. */
  assistant?: { workspaceId: string; locationId?: string }
  /** P4.1: the Offers nav entry renders only when OFFER_PROMOTIONS_ENABLED is on (non-demo workspaces); absent means hidden. */
  offersEnabled?: boolean
}

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
        {coverage != null && <strong>{coverage}% {isChinese ? zhFor(locale, "覆蓋率") : "coverage"}</strong>}
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
    // Scrolls sideways on phones, so keyboard users need to be able to focus it (WCAG 2.1.1).
    <ol className="loop-ribbon" tabIndex={0} aria-label={locale === "en" ? "Visibility improvement loop" : "能見度改善循環"}>
      {steps.map((step, index) => (
        <li key={step} className={index === active ? "is-active" : index < active ? "is-done" : ""}>
          <span className="loop-index">{index < active ? <Check aria-hidden="true" /> : index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}

export function LocaleSelect({ locale }: { locale: PrototypeLocale }) {
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
        <SelectValue><span className="locale-full">{LOCALE_NAMES[locale]}</span><span className="locale-short" aria-hidden="true">{LOCALE_SHORT_NAMES[locale]}</span></SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {supportedLocales.map((item) => (
          <SelectItem key={item} value={item}>{LOCALE_NAMES[item]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function PublicHeader({ locale, signInHref }: { locale: PrototypeLocale; signInHref?: string }) {
  // A page with its own context (an unlocked report) passes a sign-in link that
  // carries it, so signing in from the header does not drop the claim (F-20).
  const signIn = signInHref ?? `/${locale}/owner/sign-in`
  const t = copy[locale]
  const isChinese = locale !== "en"
  return (
    <header className="public-header">
      <div className="public-header-inner">
        <PublicBrandLink locale={locale} />
        <PublicNavLinks locale={locale} />
        <div className="header-actions">
          <span className="header-locale"><LocaleSelect locale={locale} /></span>
          {/* Returning owners need a sign-in entry point without opening the
              hamburger menu: this was `hidden lg:inline-flex`, so on any
              phone-width viewport the only way back into a workspace was the
              menu. It stays listed in the menu as well. */}
          <Button asChild variant="outline" className="header-sign-in">
            <Link href={signIn}>{t.nav.signIn}</Link>
          </Button>
          <Button asChild className="header-scan-cta hidden md:inline-flex">
            <Link href={`/${locale}/scan`}>{isChinese ? "免費掃描" : "Free scan"}<ArrowRight /></Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="public-menu-trigger" aria-label={isChinese ? "開啟選單" : "Open menu"}><Menu /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(92vw,22rem)]" closeLabel={isChinese ? "關閉選單" : "Close menu"}>
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
                <Link href={signIn}>{t.nav.signIn}</Link>
              </nav>
              {/* On phones the header has no room for the language control, so it lives here too. */}
              <div className="mobile-sheet-locale"><LocaleSelect locale={locale} /></div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

/**
 * `demo` renders the EnvironmentBar and adds the `has-env-bar` hook the CSS
 * offsets are gated behind (CLAUDE.md §5 "Global"); it is false everywhere else.
 */
export function PublicPageFrame({ locale, demo = false, signInHref, children }: { locale: PrototypeLocale; demo?: boolean; signInHref?: string; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale === "zh-HK" ? "zh-HK" : locale === "zh-TW" ? "zh-TW" : "en"
  }, [locale])
  return (
    <div className={`public-site${demo ? " has-env-bar" : ""}`}>
      <a className="skip-link" href="#main-content">{locale === "en" ? "Skip to content" : "跳到主要內容"}</a>
      <EnvironmentBar locale={locale} show={demo} />
      <PublicHeader locale={locale} signInHref={signInHref} />
      {/* Skip-link target: pages render their own <main>, so focus lands just before it. */}
      <div id="main-content" className="skip-target" tabIndex={-1} />
      {children}
      <PublicFooter locale={locale} />
      <MotionDirector />
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
