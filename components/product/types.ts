

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
  /** Optional conversation shell; computed on the server, omitted while disabled. */
  conversationEnabled?: boolean
}
