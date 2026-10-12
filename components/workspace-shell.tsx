"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  FileClock,
  FileText,
  Home,
  Layers3,
  MoreHorizontal,
  Search,
  Settings2,
  Tag,
  Users,
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
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { copy, normaliseLocale, type PrototypeLocale } from "@/lib/copy"
import { accountInitials, resolveLocationSlug, usagePercent } from "@/lib/workspace/shell"
import { ContextualAssistant } from "@/components/pocket-assistant/assistant-launcher"
import type { AssistantSurface } from "@/lib/pocket-assistant/contracts"
import { DemoBadge, EnvironmentBar, LocaleSelect, type ShellWorkspace } from "@/components/product-ui"

/**
 * The authenticated workspace chrome (sidebar, top bar, mobile nav). Kept out
 * of components/product-ui.tsx so public pages, which import that module for
 * their own chrome, do not download the sidebar and tooltip code.
 */
const primaryWorkspaceNav: ReadonlyArray<{
  key: string
  label: string
  icon: typeof Home
  suffix: string
}> = [
  { key: "home", label: "Home", icon: Home, suffix: "" },
  { key: "actions", label: "Actions", icon: FileClock, suffix: "/actions" },
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

/** Inserted after Assets when the offers feature is on; the label comes from copy, not the zh map below. */
type SecondaryNavItem = { readonly label: string; readonly icon: typeof Home; readonly suffix: string }
const offersNavItem: SecondaryNavItem = { label: "Offers", icon: Tag, suffix: "/offers" }

const englishSmallNumbers = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]

function unreadLabel(count: number, isChinese: boolean) {
  if (isChinese) return `通知，${count} 則未讀`
  return `Notifications, ${englishSmallNumbers[count] ?? String(count)} unread`
}

export function WorkspaceShell({ locale, workspace, children }: { locale: PrototypeLocale; workspace: ShellWorkspace; children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = copy[locale]
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspace.slug}`
  const location = resolveLocationSlug(searchParams.get("location"), workspace.locations, workspace.defaultLocationSlug)
  const locationName = location === "all"
    ? (isChinese ? "所有地點" : "All locations")
    : (workspace.locations.find((item) => item.slug === location)?.name ?? location)
  const scopedHref = (href: string) => `${href}${href.includes("?") ? "&" : "?"}location=${location}`
  const usageShare = usagePercent(workspace.usage.approvedDeliveries, workspace.usage.allowance)
  const actionsBadge = workspace.urgentActions && workspace.urgentActions > 0 ? String(workspace.urgentActions) : undefined
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
              : pathname.endsWith("/offers")
                ? t.workspace.offers.nav
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
  const secondaryNav: ReadonlyArray<SecondaryNavItem> = workspace.offersEnabled
    ? secondaryWorkspaceNav.flatMap<SecondaryNavItem>((item) => (item.suffix === "/assets" ? [item, offersNavItem] : [item]))
    : secondaryWorkspaceNav
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
                {primaryWorkspaceNav.map(({ key, label, icon: Icon, suffix }) => {
                  const href = scopedHref(`${base}${suffix}`)
                  const active = suffix ? pathname.startsWith(href) : pathname === base || pathname === `/${locale}/owner`
                  const badge = key === "actions" ? actionsBadge : undefined
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
                {secondaryNav.map(({ label, icon: Icon, suffix }) => {
                  const href = scopedHref(`${base}${suffix}`)
                  return (
                    <SidebarMenuItem key={label}>
                      <SidebarMenuButton asChild isActive={pathname === href}>
                        <Link href={href}><Icon /><span>{label === "Offers" ? t.workspace.offers.nav : secondaryLabelMap[label] ?? label}</span></Link>
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
            <div><span>{isChinese ? "本月核准後交付" : "Approved deliveries"}</span><strong>{workspace.usage.approvedDeliveries} / {workspace.usage.allowance === null ? "∞" : workspace.usage.allowance}</strong></div>
            {usageShare !== null && <div className="usage-track"><span style={{ width: `${usageShare}%` }} /></div>}
            <small>{isChinese ? "生成、修改或拒絕均不扣用量" : "Generation, revisions and rejection use no allowance"}</small>
          </div>
          <button className="account-button" type="button" title={workspace.account.email}>
            <span className="account-avatar">{accountInitials(workspace.account.name)}</span>
            <span><strong>{workspace.account.name}</strong><small>{workspace.account.roleLabel}</small></span>
            <MoreHorizontal aria-hidden="true" />
          </button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-mobile-brand md:hidden">
            <span className="brand-mark" aria-hidden="true"><Search /></span>
            <span><strong>{isChinese ? "能見度工作台" : "Visibility Workspace"}</strong><small>{workspace.name} · {locationName}</small></span>
          </div>
          <div className="workspace-topbar-context hidden md:flex" aria-label={isChinese ? `目前區域：${workspaceSection}` : `Current section: ${workspaceSection}`}>
            <span>{isChinese ? "店主工作台" : "Owner workspace"}</span>
            <strong>{workspaceSection}</strong>
          </div>
          <div className="workspace-topbar-spacer" />
          <ContextualAssistant locale={locale} surface={assistantSurface} triggerLabel={isChinese ? "問增長助理" : "Ask operator"} mode={workspace.assistant ? "live" : "demo"} context={workspace.assistant} basePath={workspace.assistant ? base : undefined} locationParam={location} />
          <Button asChild variant="ghost" size="icon" className="notification-button">
            <Link href={`${base}/settings/notifications`} aria-label={unreadLabel(workspace.unreadNotifications, isChinese)}><Bell />{workspace.unreadNotifications > 0 && <span className="notification-dot" />}</Link>
          </Button>
          <LocaleSelect locale={locale} />
          {workspace.demo && <DemoBadge locale={locale} />}
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
