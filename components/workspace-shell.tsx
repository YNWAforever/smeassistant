"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  FileClock,
  Home,
  MessagesSquare,
  MoreHorizontal,
  Search,
  Settings,
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
import { interpolate } from "@/lib/share"
import { accountInitials, resolveLocationSlug, usagePercent } from "@/lib/workspace/shell"
import { ThemeMenu, WorkspaceTheme } from "@/components/theme/workspace-theme"
import { ConversationNavigationProvider } from "@/components/workspace/conversation-navigation"
import { LocationSelect } from "@/components/workspace/location-select"
import { useFocusClearOfBars } from "@/hooks/use-focus-clear-of-bars"
import { DemoBadge, EnvironmentBar, LocaleSelect, type ShellWorkspace } from "@/components/product-ui"

/**
 * The authenticated workspace chrome (sidebar, top bar, mobile nav). Kept out
 * of components/product-ui.tsx so public pages, which import that module for
 * their own chrome, do not download the sidebar and tooltip code.
 *
 * Five owner destinations: Today, Tasks, Kinnso, Results, Business. Settings is
 * reached from the account menu and is deliberately not a primary destination.
 * The Kinnso chat route is immersive: the global sidebar and mobile nav step
 * aside so the Studio owns its own history rail and header.
 */
type DestinationKey = "today" | "actions" | "kinnso" | "insights" | "business"

const DESTINATIONS: ReadonlyArray<{ key: DestinationKey; icon: typeof Home; suffix: string; owns: string[] }> = [
  { key: "today", icon: Home, suffix: "", owns: [] },
  { key: "actions", icon: FileClock, suffix: "/actions", owns: ["/actions", "/packs"] },
  { key: "kinnso", icon: MessagesSquare, suffix: "/conversation", owns: ["/conversation"] },
  { key: "insights", icon: BarChart3, suffix: "/insights", owns: ["/insights"] },
  { key: "business", icon: Building2, suffix: "/business", owns: ["/business"] },
]

/** Which destination a workspace path belongs to; Today owns the workspace root. */
export function destinationFor(pathname: string, base: string): DestinationKey | null {
  if (pathname === base) return "today"
  for (const destination of DESTINATIONS) {
    if (destination.owns.some((suffix) => pathname === `${base}${suffix}` || pathname.startsWith(`${base}${suffix}/`))) return destination.key
  }
  return null
}

function AccountMenu({ locale, workspace, base }: { locale: PrototypeLocale; workspace: ShellWorkspace; base: string }) {
  const t = copy[locale].shell
  return (
    <details className="account-menu">
      <summary className="account-button" aria-label={t.accountMenu.label} title={workspace.account.email}>
        <span className="account-avatar">{accountInitials(workspace.account.name)}</span>
        <span><strong>{workspace.account.name}</strong><small>{workspace.account.roleLabel}</small></span>
        <MoreHorizontal aria-hidden="true" />
      </summary>
      <div className="account-menu-popover" role="group" aria-label={t.accountMenu.label}>
        <Link href={`${base}/settings`}><Settings aria-hidden="true" /><span>{t.nav.settings}</span></Link>
        <Link href={`/${locale}/owner/select-workspace`}><ChevronDown aria-hidden="true" /><span>{t.settings.account.title}</span></Link>
        <small>{workspace.account.roleLabel}</small>
      </div>
    </details>
  )
}

export function WorkspaceShell({ locale, workspace, children }: { locale: PrototypeLocale; workspace: ShellWorkspace; children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = copy[locale].shell
  useFocusClearOfBars(".workspace-topbar", ".mobile-bottom-nav")
  const base = `/${locale}/owner/${workspace.slug}`
  const location = resolveLocationSlug(searchParams.get("location"), workspace.locations, workspace.defaultLocationSlug)
  const locationName = location === "all" ? t.allLocations : (workspace.locations.find((item) => item.slug === location)?.name ?? location)
  const scopedHref = (href: string) => `${href}${href.includes("?") ? "&" : "?"}location=${location}`
  const usageShare = usagePercent(workspace.usage.approvedDeliveries, workspace.usage.allowance)
  const actionsBadge = workspace.urgentActions && workspace.urgentActions > 0 ? interpolate(t.nav.urgent, { count: workspace.urgentActions }) : undefined
  const current = destinationFor(pathname, base)
  const isNewAction = pathname === `${base}/actions/new`
  const isActionDetail = !isNewAction && pathname.startsWith(`${base}/actions/`)
  // The Studio owns a full-height, chrome-light surface. Only the exact chat
  // route is immersive; /conversation/notes stays inside the normal shell.
  const isChat = workspace.conversationEnabled && pathname === `${base}/conversation`
  const isConversation = workspace.conversationEnabled && pathname.startsWith(`${base}/conversation`)
  const isSettings = pathname.startsWith(`${base}/settings`)
  const destinations = DESTINATIONS.filter((destination) => destination.key !== "kinnso" || workspace.conversationEnabled)
  const workspaceSection = isConversation
    ? t.nav.kinnso
    : isSettings
      ? t.nav.settings
      : isNewAction
        ? t.context.newAction
        : isActionDetail
          ? t.context.review
          : t.nav[current ?? "today"]
  const notificationsLabel = workspace.unreadNotifications > 0
    ? interpolate(t.notifications.unread, { count: workspace.unreadNotifications })
    : t.notifications.label

  return (
    <SidebarProvider className={`workspace-shell${isChat ? " workspace-shell--chat" : ""}${isConversation && !isChat ? " workspace-shell--conversation" : ""}`}>
      <a className="skip-link" href="#main-content">{t.skip}</a>
      {!isChat && <Sidebar collapsible="none" className="workspace-sidebar hidden md:flex">
        <SidebarHeader className="workspace-sidebar-header">
          {/* The plain workspace URL (no ?location=): the home link signed-in tests and bookmarks rely on. */}
          <Link className="brand-lockup brand-lockup-inverse" href={base}>
            <span className="brand-mark" aria-hidden="true"><Search /></span>
            <span><strong>{t.brand.name}</strong><small>{t.brand.tagline}</small></span>
          </Link>
          <Link className="workspace-switcher" href={`/${locale}/owner/select-workspace`} aria-label={t.switcher}>
            <span className="workspace-avatar">{workspace.avatarInitial}</span>
            <span><strong>{workspace.name}</strong><small>{locationName}</small></span>
            <ChevronDown aria-hidden="true" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t.nav.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {destinations.map(({ key, icon: Icon, suffix }) => {
                  const active = current === key
                  const badge = key === "actions" ? actionsBadge : undefined
                  return (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuButton asChild isActive={active} tooltip={t.nav[key]}>
                        <Link href={scopedHref(`${base}${suffix}`)} aria-current={active ? "page" : undefined}><Icon /><span>{t.nav[key]}</span></Link>
                      </SidebarMenuButton>
                      {badge && <SidebarMenuBadge>{badge}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="workspace-sidebar-footer">
          <div className="usage-mini">
            <div><span>{t.usage.label}</span><strong>{workspace.usage.approvedDeliveries} / {workspace.usage.allowance === null ? "∞" : workspace.usage.allowance}</strong></div>
            {usageShare !== null && <div className="usage-track"><span style={{ width: `${usageShare}%` }} /></div>}
            <small>{t.usage.note}</small>
          </div>
          <AccountMenu locale={locale} workspace={workspace} base={base} />
        </SidebarFooter>
      </Sidebar>}
      <SidebarInset className="workspace-main">
        <header className={`workspace-topbar${isChat ? " workspace-topbar--chat" : ""}`}>
          {!isChat && <div className="workspace-mobile-brand md:hidden">
            <span className="brand-mark" aria-hidden="true"><Search /></span>
            <span><strong>{workspace.name}</strong>{workspace.locations.length > 1 ? <LocationSelect locale={locale} value={location} locations={workspace.locations} className="mobile-location-select" /> : <small>{locationName}</small>}</span>
          </div>}
          {!isChat && <div className="workspace-topbar-context hidden md:flex" aria-label={`${t.context.owner}: ${workspaceSection}`}>
            <span>{t.context.owner}</span>
            <strong>{workspaceSection}</strong>
          </div>}
          <div className="workspace-topbar-spacer" />
          <Button asChild variant="ghost" size="icon" className="notification-button">
            <Link href={scopedHref(`${base}/settings/notifications`)} aria-label={notificationsLabel}><Bell />{workspace.unreadNotifications > 0 && <span className="notification-dot" />}</Link>
          </Button>
          <ThemeMenu locale={locale} />
          <LocaleSelect locale={locale} />
          {workspace.demo && <DemoBadge locale={locale} />}
          {!isChat && <div className="mobile-account md:hidden"><AccountMenu locale={locale} workspace={workspace} base={base} /></div>}
          {isChat && <AccountMenu locale={locale} workspace={workspace} base={base} />}
        </header>
        <main className={`workspace-content${isChat ? " workspace-content--chat" : ""}`} id="main-content" tabIndex={-1}>{children}</main>
        {!isChat && <nav className="mobile-bottom-nav md:hidden" aria-label={t.nav.label}>
          {destinations.map(({ key, icon: Icon, suffix }) => {
            const active = current === key
            return <Link key={key} href={scopedHref(`${base}${suffix}`)} aria-current={active ? "page" : undefined} className={active ? "is-active" : ""}><Icon /><span>{t.nav[key]}</span></Link>
          })}
        </nav>}
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
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const conversationScope = workspace.conversationEnabled && pathname === `/${safeLocale}/owner/${workspace.slug}/conversation`
    ? JSON.stringify([workspace.slug, workspace.account.email, resolveLocationSlug(searchParams.get("location"), workspace.locations, workspace.defaultLocationSlug)])
    : "outside-conversation"
  useEffect(() => {
    document.documentElement.lang = safeLocale === "zh-HK" ? "zh-HK" : safeLocale === "zh-TW" ? "zh-TW" : "en"
  }, [safeLocale])
  return (
    <WorkspaceTheme>
      <div className={`workspace-root${demo ? " has-env-bar" : ""}`}>
        <EnvironmentBar locale={safeLocale} show={demo} />
        <ConversationNavigationProvider key={conversationScope}><WorkspaceShell locale={safeLocale} workspace={workspace}>{children}</WorkspaceShell></ConversationNavigationProvider>
      </div>
    </WorkspaceTheme>
  )
}
