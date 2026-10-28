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
  FileText,
  LayoutTemplate,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Plug,
  Search,
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
import { ContextualAssistant } from "@/components/pocket-assistant/assistant-launcher"
import { ThemeMenu, WorkspaceTheme } from "@/components/theme/workspace-theme"
import { ConversationSwitch } from "@/components/workspace/conversation-switch"
import { conversationDesignCopy } from "@/lib/copy-conversation-design"
import { ConversationNavigationProvider, openConversationTool, useConversationNavigation } from "@/components/workspace/conversation-navigation"
import { LocationSelect } from "@/components/workspace/location-select"
import { useFocusClearOfBars } from "@/hooks/use-focus-clear-of-bars"
import type { AssistantSurface } from "@/lib/pocket-assistant/contracts"
import { DemoBadge, EnvironmentBar, LocaleSelect, type ShellWorkspace } from "@/components/product-ui"

/**
 * The authenticated workspace chrome (sidebar, top bar, mobile nav). Kept out
 * of components/product-ui.tsx so public pages, which import that module for
 * their own chrome, do not download the sidebar and tooltip code.
 *
 * Four destinations: Today, To do, Better?, Shop. Shop owns existing Business
 * and Settings routes, so bookmarked settings pages keep the same highlight.
 */
type DestinationKey = "today" | "actions" | "insights" | "business"

const DESTINATIONS: ReadonlyArray<{ key: DestinationKey; icon: typeof Home; suffix: string; owns: string[] }> = [
  { key: "today", icon: Home, suffix: "", owns: [] },
  { key: "actions", icon: FileClock, suffix: "/actions", owns: ["/actions", "/packs"] },
  { key: "insights", icon: BarChart3, suffix: "/insights", owns: ["/insights"] },
  { key: "business", icon: Building2, suffix: "/business", owns: ["/business", "/settings"] },
]

/** Which destination a workspace path belongs to; Today owns the workspace root. */
export function destinationFor(pathname: string, base: string): DestinationKey | null {
  if (pathname === base) return "today"
  for (const destination of DESTINATIONS) {
    if (destination.owns.some((suffix) => pathname === `${base}${suffix}` || pathname.startsWith(`${base}${suffix}/`))) return destination.key
  }
  return null
}

export function WorkspaceShell({ locale, workspace, children }: { locale: PrototypeLocale; workspace: ShellWorkspace; children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = copy[locale].shell
  const d = conversationDesignCopy[locale]
  const conversationNavigation = useConversationNavigation()
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
  const isConversation = workspace.conversationEnabled && pathname === `${base}/conversation`
  const workspaceSection = isConversation ? d.discussion : isNewAction ? t.context.newAction : isActionDetail ? t.context.review : t.nav[current ?? "today"]
  const assistantSurface: AssistantSurface = isNewAction
    ? "create"
    : isActionDetail
      ? "action"
      : current === "actions"
        ? "actions"
        : current === "insights"
          ? "insights"
          : pathname.startsWith(`${base}/business/assets`)
            ? "assets"
            : "home"
  const notificationsLabel = workspace.unreadNotifications > 0
    ? interpolate(t.notifications.unread, { count: workspace.unreadNotifications })
    : t.notifications.label

  return (
    <SidebarProvider className={`workspace-shell${isConversation ? " workspace-shell--conversation" : ""}`}>
      <a className="skip-link" href="#main-content">{t.skip}</a>
      <Sidebar collapsible="none" className="workspace-sidebar hidden md:flex">
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
          {isConversation && <>
            <Link className="conversation-sidebar-new" href={scopedHref(`${base}/conversation`)}><Plus aria-hidden="true" />{d.newDiscussion}</Link>
            <Link className="conversation-sidebar-active" href={scopedHref(`${base}/conversation`)} aria-current="page"><MessagesSquare aria-hidden="true" />{d.discussion}</Link>
          </>}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t.nav.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {DESTINATIONS.map(({ key, icon: Icon, suffix }) => {
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
          {isConversation && <>
            <SidebarGroup><SidebarGroupLabel>{d.together}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
              {([
                { label: d.documents, icon: FileText, target: "conversation-documents" },
                { label: d.templateNav, icon: LayoutTemplate, target: "conversation-templates" },
                { label: d.sources, icon: Plug, target: "conversation-sources" },
              ]).map(({ label, icon: Icon, target }) => <SidebarMenuItem key={target}>
                <SidebarMenuButton asChild>{target === "conversation-templates"
                  ? <Link href={`${scopedHref(`${base}/conversation`)}#${target}`}><Icon /><span>{label}</span></Link>
                  : <a href={`#${target}`} onClick={() => openConversationTool(target)}><Icon /><span>{label}</span></a>}
                </SidebarMenuButton>
              </SidebarMenuItem>)}
            </SidebarMenu></SidebarGroupContent></SidebarGroup>
            <SidebarGroup><SidebarGroupLabel>{d.recent}</SidebarGroupLabel><SidebarGroupContent><ul className="conversation-sidebar-recent">
              {conversationNavigation?.threads.map(thread => <li key={thread.id}><Link href={`${base}/conversation?location=${encodeURIComponent(location)}&thread=${encodeURIComponent(thread.id)}`}><span>{thread.title}</span><small>{d.local}</small></Link></li>)}
            </ul><a className="conversation-sidebar-all" href="#conversation-recent">{d.recent}</a></SidebarGroupContent></SidebarGroup>
          </>}
        </SidebarContent>
        <SidebarFooter className="workspace-sidebar-footer">
          {isConversation ? <details className="usage-mini conversation-usage">
            <summary><span>{t.usage.label}</span><strong>{workspace.usage.approvedDeliveries} / {workspace.usage.allowance === null ? "∞" : workspace.usage.allowance}</strong></summary>
            <small>{t.usage.note}</small>
          </details> : <div className="usage-mini">
            <div><span>{t.usage.label}</span><strong>{workspace.usage.approvedDeliveries} / {workspace.usage.allowance === null ? "∞" : workspace.usage.allowance}</strong></div>
            {usageShare !== null && <div className="usage-track"><span style={{ width: `${usageShare}%` }} /></div>}
            <small>{t.usage.note}</small>
          </div>}
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
            <span><strong>{workspace.name}</strong>{workspace.locations.length > 1 ? <LocationSelect locale={locale} value={location} locations={workspace.locations} className="mobile-location-select" /> : <small>{locationName}</small>}</span>
          </div>
          <div className="workspace-topbar-context hidden md:flex" aria-label={`${t.context.owner}: ${workspaceSection}`}>
            <span>{t.context.owner}</span>
            <strong>{workspaceSection}</strong>
          </div>
          <div className="workspace-topbar-spacer" />
          <ContextualAssistant locale={locale} surface={assistantSurface} triggerLabel={t.assistant.name} mode={workspace.assistant ? "live" : "demo"} context={workspace.assistant} basePath={workspace.assistant ? base : undefined} locationParam={location} />
          <Button asChild variant="ghost" size="icon" className="notification-button">
            <Link href={scopedHref(`${base}/settings/notifications`)} aria-label={notificationsLabel}><Bell />{workspace.unreadNotifications > 0 && <span className="notification-dot" />}</Link>
          </Button>
          <ThemeMenu locale={locale} />
          <LocaleSelect locale={locale} />
          {workspace.demo && <DemoBadge locale={locale} />}
        </header>
        <main className="workspace-content" id="main-content" tabIndex={-1}>{workspace.conversationEnabled && (pathname === base || isConversation) && <ConversationSwitch locale={locale} base={base} location={location} active={!!isConversation} />}{children}</main>
        <nav className="mobile-bottom-nav md:hidden" aria-label={t.nav.label}>
          {DESTINATIONS.map(({ key, icon: Icon, suffix }) => {
            const active = current === key
            return <Link key={key} href={scopedHref(`${base}${suffix}`)} aria-current={active ? "page" : undefined} className={active ? "is-active" : ""}><Icon /><span>{t.nav[key]}</span></Link>
          })}
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
