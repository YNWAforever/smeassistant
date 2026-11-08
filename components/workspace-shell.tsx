"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  BarChart3,
  Bell,
  ChevronDown,
  FileClock,
  Home,
  MessagesSquare,
  MoreHorizontal,
  Search,
  WandSparkles,
} from "lucide-react"
import { useEffect, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
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
} from "@/components/ui/sidebar"
import { copy, normaliseLocale, type PrototypeLocale } from "@/lib/copy"
import { studioText } from "@/lib/studio/copy"
import { accountInitials, resolveLocationSlug, usagePercent } from "@/lib/workspace/shell"
import { ContextualAssistant } from "@/components/pocket-assistant/assistant-launcher"
import { useFocusClearOfBars } from "@/hooks/use-focus-clear-of-bars"
import type { AssistantSurface } from "@/lib/pocket-assistant/contracts"
import { DemoBadge, EnvironmentBar, LocaleSelect, type ShellWorkspace } from "@/components/product-ui"
import { zhFor } from "@/lib/zh-tw"

/**
 * The authenticated workspace chrome (sidebar, top bar, mobile nav). Kept out
 * of components/product-ui.tsx so public pages, which import that module for
 * their own chrome, do not download the sidebar and tooltip code.
 *
 * `studio` is first and only present with CONVERSATION_STUDIO_ENABLED on
 * (design §2 S1/S6): the conversation is the primary owner surface, and the
 * top-bar sheet trigger becomes an "Open Studio" link. With the flag off the
 * navigation is byte-for-byte what it was.
 */
const primaryWorkspaceNav: ReadonlyArray<{
  key: string
  label: string
  icon: typeof Home
  suffix: string
}> = [
  { key: "studio", label: "Studio", icon: MessagesSquare, suffix: "/studio" },
  { key: "home", label: "Home", icon: Home, suffix: "" },
  { key: "actions", label: "Actions", icon: FileClock, suffix: "/actions" },
  { key: "create", label: "Create", icon: WandSparkles, suffix: "/create" },
  { key: "insights", label: "Insights", icon: BarChart3, suffix: "/insights" },
]

const englishSmallNumbers = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]

function unreadLabel(count: number, isChinese: boolean) {
  if (isChinese) return `通知，${count} 則未讀`
  return `Notifications, ${englishSmallNumbers[count] ?? String(count)} unread`
}

export function WorkspaceShell({ locale, workspace, children }: { locale: PrototypeLocale; workspace: ShellWorkspace; children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = copy[locale]
  const studio = studioText(locale)
  const studioEnabled = workspace.studioEnabled === true
  // With the flag off the list is exactly the old one; with it on Studio leads
  // the desktop sidebar and the mobile bar drops Create to keep five targets.
  const primaryNav = studioEnabled ? primaryWorkspaceNav : primaryWorkspaceNav.filter((item) => item.key !== "studio")
  const mobileNav = studioEnabled ? primaryNav.filter((item) => item.key !== "create") : primaryNav
  // With the Studio, the workspace root redirects to the conversation, so the
  // Home tab points at the /today brief instead of the root.
  const homeSuffix = studioEnabled ? "/today" : ""
  const navSuffix = (key: string, suffix: string) => (key === "home" ? homeSuffix : suffix)
  useFocusClearOfBars(".workspace-topbar", ".mobile-bottom-nav")
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspace.slug}`
  const location = resolveLocationSlug(searchParams.get("location"), workspace.locations, workspace.defaultLocationSlug)
  const locationName = location === "all"
    ? (isChinese ? zhFor(locale, "所有地點") : "All locations")
    : (workspace.locations.find((item) => item.slug === location)?.name ?? location)
  const scopedHref = (href: string) => `${href}${href.includes("?") ? "&" : "?"}location=${location}`
  const usageShare = usagePercent(workspace.usage.approvedDeliveries, workspace.usage.allowance)
  const actionsBadge = workspace.urgentActions && workspace.urgentActions > 0 ? String(workspace.urgentActions) : undefined
  const workspaceSection = pathname.includes("/actions/")
    ? (isChinese ? zhFor(locale, "審閱與審批") : "Review & approve")
    : pathname.endsWith("/studio")
      ? studio.nav.label
      : pathname.endsWith("/today")
        ? t.nav.home
        : pathname.endsWith("/actions")
        ? t.nav.actions
        : pathname.endsWith("/create")
          ? t.nav.create
          : pathname.endsWith("/insights")
            ? t.nav.insights
            : pathname.includes("/settings/")
              ? (isChinese ? "工作台設定" : "Workspace settings")
              : pathname.endsWith("/assets")
                ? (isChinese ? "素材" : "Assets")
                : pathname.endsWith("/offers")
                  ? t.workspace.offers.nav
                  : pathname.endsWith("/calendar")
                    ? (isChinese ? "日曆" : "Calendar")
                    : pathname.endsWith("/activity")
                      ? (isChinese ? "活動紀錄" : "Activity")
                      : pathname.endsWith("/more") ? t.nav.more : t.nav.home
  const labelMap: Record<string, string> = {
    Studio: studio.nav.label,
    Home: t.nav.home,
    Actions: t.nav.actions,
    Create: t.nav.create,
    Insights: t.nav.insights,
  }
  const moreActive = ["/more", "/assets", "/calendar", "/activity", "/settings", "/offers", "/packs"]
    .some((suffix) => pathname === `${base}${suffix}` || pathname.startsWith(`${base}${suffix}/`))
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
      <a className="skip-link" href="#main-content">{isChinese ? "跳到主要內容" : "Skip to content"}</a>
      <Sidebar collapsible="none" className="workspace-sidebar hidden md:flex">
        <SidebarHeader className="workspace-sidebar-header">
          <Link className="brand-lockup brand-lockup-inverse" href={studioEnabled ? `${base}/studio` : base}>
            <span className="brand-mark" aria-hidden="true"><Search /></span>
            <span><strong>Visibility</strong><small>Workspace</small></span>
          </Link>
          <Link className="workspace-switcher" href={`/${locale}/owner/select-workspace`} aria-label={isChinese ? "切換工作台或分店" : "Switch workspace or location"}>
            <span className="workspace-avatar">{workspace.avatarInitial}</span>
            <span><strong>{workspace.name}</strong><small>{locationName}</small></span>
            <ChevronDown aria-hidden="true" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{isChinese ? "今日工作" : "Operate"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryNav.map(({ key, label, icon: Icon, suffix }) => {
                  const effectiveSuffix = navSuffix(key, suffix)
                  const href = scopedHref(`${base}${effectiveSuffix}`)
                  const path = `${base}${effectiveSuffix}`
                  const active = effectiveSuffix ? pathname === path || pathname.startsWith(`${path}/`) : pathname === base || pathname === `/${locale}/owner`
                  const badge = key === "actions" ? actionsBadge : undefined
                  return (
                    <SidebarMenuItem key={label}>
                      <SidebarMenuButton asChild isActive={active} tooltip={labelMap[label] ?? label}>
                        <Link href={href} aria-current={active ? "page" : undefined}><Icon /><span>{labelMap[label] ?? label}</span></Link>
                      </SidebarMenuButton>
                      {badge && <SidebarMenuBadge>{badge}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  )
                })}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={moreActive}>
                    <Link href={scopedHref(`${base}/more`)} aria-current={moreActive ? "page" : undefined}><MoreHorizontal /><span>{t.nav.more}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="workspace-sidebar-footer">
          <div className="usage-mini">
            <div><span>{isChinese ? "本月核准後交付" : "Approved deliveries"}</span><strong>{workspace.usage.approvedDeliveries} / {workspace.usage.allowance === null ? "∞" : workspace.usage.allowance}</strong></div>
            {usageShare !== null && <div className="usage-track"><span style={{ width: `${usageShare}%` }} /></div>}
            <small>{isChinese ? "生成、修改或拒絕均不扣用量" : "Generation, revisions and rejection use no allowance"}</small>
          </div>
          <Link className="account-button" href={`/${locale}/owner/select-workspace`} title={workspace.account.email}>
            <span className="account-avatar">{accountInitials(workspace.account.name)}</span>
            <span><strong>{workspace.account.name}</strong><small>{workspace.account.roleLabel}</small></span>
            <MoreHorizontal aria-hidden="true" />
          </Link>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-mobile-brand md:hidden">
            <span className="brand-mark" aria-hidden="true"><Search /></span>
            <span><strong>{isChinese ? "能見度工作台" : "Visibility Workspace"}</strong><small>{workspace.name} · {locationName}</small></span>
          </div>
          <div className="workspace-topbar-context hidden md:flex" aria-label={isChinese ? `目前區域：${workspaceSection}` : `Current section: ${workspaceSection}`}>
            <span>{isChinese ? zhFor(locale, "店主工作台") : "Owner workspace"}</span>
            <strong>{workspaceSection}</strong>
          </div>
          <div className="workspace-topbar-spacer" />
          {studioEnabled ? (
            <Button asChild variant="outline" size="sm" className="workspace-studio-link">
              <Link href={scopedHref(`${base}/studio`)} aria-label={studio.nav.aria}>
                <MessagesSquare aria-hidden="true" />
                <span>{studio.header.openStudio}</span>
              </Link>
            </Button>
          ) : (
            <ContextualAssistant locale={locale} surface={assistantSurface} triggerLabel={isChinese ? "問增長助理" : "Ask operator"} mode={workspace.assistant ? "live" : "demo"} context={workspace.assistant} basePath={workspace.assistant ? base : undefined} locationParam={location} />
          )}
          <Button asChild variant="ghost" size="icon" className="notification-button">
            <Link href={scopedHref(`${base}/settings/notifications`)} aria-label={unreadLabel(workspace.unreadNotifications, isChinese)}><Bell />{workspace.unreadNotifications > 0 && <span className="notification-dot" />}</Link>
          </Button>
          <LocaleSelect locale={locale} />
          {workspace.demo && <DemoBadge locale={locale} />}
        </header>
        <main className="workspace-content" id="main-content" tabIndex={-1}>{children}</main>
        <nav className="mobile-bottom-nav md:hidden" aria-label={isChinese ? "工作台導覽" : "Workspace navigation"}>
          {mobileNav.map(({ key, label, icon: Icon, suffix }) => {
            const effectiveSuffix = navSuffix(key, suffix)
            const href = scopedHref(`${base}${effectiveSuffix}`)
            const path = `${base}${effectiveSuffix}`
            const active = effectiveSuffix ? pathname === path || pathname.startsWith(`${path}/`) : pathname === base
            return <Link key={key} href={href} aria-current={active ? "page" : undefined} className={active ? "is-active" : ""}><Icon /><span>{labelMap[label] ?? label}</span></Link>
          })}
          <Link href={scopedHref(`${base}/more`)} aria-current={moreActive ? "page" : undefined} className={moreActive ? "is-active" : ""}>
            <MoreHorizontal /><span>{t.nav.more}</span>
          </Link>
        </nav>
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * `demo` keeps the EnvironmentBar / `has-env-bar` behaviour (CLAUDE.md §5
 * "Global"); `workspace` is the real (or demo) shell data — the frame never
 * invents either.
 */
export function WorkspacePageFrame({ locale, workspace, demo = false, children }: { locale: string; workspace: ShellWorkspace; demo?: boolean; children: ReactNode }) {
  const safeLocale = normaliseLocale(locale)
  useEffect(() => {
    document.documentElement.lang = safeLocale === "zh-HK" ? "zh-HK" : safeLocale === "zh-TW" ? "zh-TW" : "en"
  }, [safeLocale])
  return (
    <div className={`workspace-root${demo ? " has-env-bar" : ""}`}>
      <EnvironmentBar locale={safeLocale} show={demo} />
      <WorkspaceShell locale={safeLocale} workspace={workspace}>{children}</WorkspaceShell>
    </div>
  )
}
