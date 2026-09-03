import type { ShellWorkspace } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"

// Domain enums live in lib/domain.ts (CLAUDE.md section 3.4); re-exported here unchanged.
export type { ActionState, ApprovalState, Capability, DeliveryState, MeasurementState, ProviderState, RunState } from "@/lib/domain"
import type { ActionState, ApprovalState, Capability, DeliveryState, MeasurementState, ProviderState, RunState } from "@/lib/domain"


export type DemoAction = {
  id: string
  title: string
  summary: string
  source: string
  evidence: string
  observedAt: string
  freshness: string
  location: string
  priority: "Urgent" | "High" | "Medium" | "Low"
  reason: string
  effort: string
  assignee: string
  due: string
  workflow: string
  requiredInputs: string[]
  actionState: ActionState
  runState: RunState
  approvalState: ApprovalState
  deliveryState: DeliveryState
  measurementState: MeasurementState
  displayPhase: string
  capability: Capability
}

export const merchant = {
  id: "demo-merchant-kam-man-house",
  name: "錦汶館",
  industry: "Hong Kong café · F&B",
  market: "Hong Kong",
  currency: "HKD",
  timezone: "Asia/Hong_Kong",
  demo: true,
}

/**
 * The fixed Kam Man House sample the workspace chrome renders on
 * /demo-workspace and the prototype bridge pages (guardrail 12). Real
 * workspaces build a ShellWorkspace from the database (lib/workspace/shell.ts)
 * and never read this. `demoShellWorkspaceFor` localises the location names
 * and role label the way the prototype did inline.
 */
export const demoShellWorkspace: ShellWorkspace = {
  slug: "kam-man-house",
  name: "錦汶館",
  avatarInitial: "錦",
  locations: [
    { slug: "yik-yam", name: "Yik Yam Street" },
    { slug: "tin-hau", name: "Tin Hau" },
  ],
  defaultLocationSlug: "yik-yam",
  usage: { approvedDeliveries: 5, allowance: 12 },
  account: { name: "Willy Lai", email: "owner@example.com", roleLabel: "Owner" },
  unreadNotifications: 3,
  demo: true,
  urgentActions: 3,
}

export function demoShellWorkspaceFor(locale: PrototypeLocale): ShellWorkspace {
  const isChinese = locale !== "en"
  return {
    ...demoShellWorkspace,
    locations: [
      { slug: "yik-yam", name: isChinese ? "奕蔭街" : "Yik Yam Street" },
      { slug: "tin-hau", name: isChinese ? "天后" : "Tin Hau" },
    ],
    account: { ...demoShellWorkspace.account, roleLabel: isChinese ? "店主" : "Owner" },
  }
}

export const locations = [
  {
    id: "yik-yam-street",
    name: "Yik Yam Street",
    address: "8 Yik Yam Street, Happy Valley",
    score: 62,
    delta: -4,
    coverage: 78,
  },
  {
    id: "tin-hau",
    name: "Tin Hau",
    address: "Electric Road, Tin Hau",
    score: 69,
    delta: 3,
    coverage: 82,
  },
] as const

export const comparableScans = [
  { id: "scan-aug-01", date: "1 Aug 2026", score: 66, coverage: 79, comparable: true },
  { id: "scan-aug-15", date: "15 Aug 2026", score: null, coverage: 46, comparable: false },
  { id: "scan-aug-25", date: "25 Aug 2026", score: 62, coverage: 78, comparable: true },
] as const

export const providers: Array<{
  name: string
  state: ProviderState
  value: string
  detail: string
  observedAt: string
}> = [
  {
    name: "Google Business & Maps",
    state: "measured",
    value: "18% response rate",
    detail: "7 recent reviews have no owner response.",
    observedAt: "25 Aug 2026 · 09:42 HKT",
  },
  {
    name: "Public website",
    state: "measured",
    value: "12 of 15 checks",
    detail: "Menu and opening hours were readable; FAQ coverage was limited.",
    observedAt: "25 Aug 2026 · 09:43 HKT",
  },
  {
    name: "Google Search & AI surfaces",
    state: "measured",
    value: "2 of 5 queries",
    detail: "Business appeared in Maps and one AI Overview, not in three comparable queries.",
    observedAt: "25 Aug 2026 · 09:45 HKT",
  },
  {
    name: "Instagram public evidence",
    state: "unavailable",
    value: "Not scored",
    detail: "The provider did not return a complete public profile snapshot. This does not lower the score.",
    observedAt: "25 Aug 2026 · 09:44 HKT",
  },
]

export const actions: DemoAction[] = [
  {
    id: "review-response",
    title: "Reply to 7 unanswered Google reviews",
    summary: "Seven recent customer reviews still need an owner response.",
    source: "Google Business & Maps",
    evidence: "Response rate fell from 31% to 18%; the local comparison is 61%.",
    observedAt: "25 Aug 2026 · 09:42 HKT",
    freshness: "Observed yesterday",
    location: "Yik Yam Street",
    priority: "Urgent",
    reason: "Fresh regression · high-intent surface · drafts already prepared",
    effort: "10 minutes",
    assignee: "Willy Lai",
    due: "Today",
    workflow: "Review response workflow",
    requiredInputs: ["Brand voice", "Original reviews", "Preferred language"],
    actionState: "in_progress",
    runState: "succeeded",
    approvalState: "draft",
    deliveryState: "not_requested",
    measurementState: "awaiting_comparable_scan",
    displayPhase: "Draft ready",
    capability: "Demo",
  },
  {
    id: "social-post",
    title: "Close a 16-day Instagram posting gap",
    summary: "Prepare this week's lunch-set post using an approved dish asset.",
    source: "Instagram public evidence",
    evidence: "Last confirmed public post was 16 days ago; current provider coverage is partial.",
    observedAt: "22 Aug 2026 · 14:10 HKT",
    freshness: "Evidence 4 days old",
    location: "Yik Yam Street",
    priority: "High",
    reason: "Persistent content gap · approved photo available",
    effort: "8 minutes",
    assignee: "Content approver",
    due: "28 Aug",
    workflow: "Social post workflow",
    requiredInputs: ["Approved dish photo", "Offer details", "Alt text confirmation"],
    actionState: "ready",
    runState: "succeeded",
    approvalState: "changes_requested",
    deliveryState: "not_requested",
    measurementState: "not_eligible",
    displayPhase: "Changes requested",
    capability: "Demo",
  },
  {
    id: "visibility-content",
    title: "Add a clear private-dining FAQ",
    summary: "Answer the questions that were missing from three search and AI-surface checks.",
    source: "Google Search & AI surfaces",
    evidence: "No supported answer found for capacity, booking lead time, or vegetarian options.",
    observedAt: "25 Aug 2026 · 09:45 HKT",
    freshness: "Observed yesterday",
    location: "All locations",
    priority: "High",
    reason: "Repeated query gap · owner facts required",
    effort: "15 minutes",
    assignee: "Willy Lai",
    due: "30 Aug",
    workflow: "Visibility content workflow",
    requiredInputs: ["Capacity", "Booking policy", "Confirmed dietary options"],
    actionState: "needs_input",
    runState: "queued",
    approvalState: "draft",
    deliveryState: "not_requested",
    measurementState: "not_eligible",
    displayPhase: "Needs input",
    capability: "Demo",
  },
  {
    id: "menu-translation",
    title: "Review the English menu translation",
    summary: "Confirm ingredient and allergen terms before exporting the bilingual menu.",
    source: "Public website",
    evidence: "English labels were missing for 9 of 24 menu items.",
    observedAt: "25 Aug 2026 · 09:43 HKT",
    freshness: "Observed yesterday",
    location: "Tin Hau",
    priority: "Medium",
    reason: "Content completeness gap · facts require owner confirmation",
    effort: "20 minutes",
    assignee: "Manager",
    due: "2 Sep",
    workflow: "Menu translation workflow",
    requiredInputs: ["Ingredients", "Allergens", "Current prices"],
    actionState: "needs_input",
    runState: "queued",
    approvalState: "draft",
    deliveryState: "not_requested",
    measurementState: "not_eligible",
    displayPhase: "Needs input",
    capability: "Demo",
  },
  {
    id: "google-reconnect",
    title: "Restore Google Business access",
    summary: "Reconnect the account before direct review delivery can be enabled.",
    source: "Integration health",
    evidence: "The current connection token expired on 24 Aug 2026; read coverage may be incomplete.",
    observedAt: "24 Aug 2026 · 18:04 HKT",
    freshness: "Updated 2 days ago",
    location: "All locations",
    priority: "Medium",
    reason: "Expired scope · delivery remains export-only",
    effort: "5 minutes",
    assignee: "Workspace owner",
    due: "This week",
    workflow: "Connection recovery",
    requiredInputs: ["Google account owner"],
    actionState: "needs_input",
    runState: "cancelled",
    approvalState: "draft",
    deliveryState: "failed",
    measurementState: "insufficient_coverage",
    displayPhase: "Requires connection",
    capability: "Requires connection",
  },
]

export const draftVersions = [
  {
    id: "v2",
    label: "Version 2 · Current",
    author: "Willy Lai",
    time: "26 Aug · 10:18",
    content:
      "多謝你再次到訪錦汶館，亦感謝你提到午市等候時間。星期五午市確實較繁忙，我們已調整帶位安排，希望下次能讓你更快入座。期待再為你準備一頓暖心的家常菜。",
    alt: "",
  },
  {
    id: "v1",
    label: "Version 1 · Generated",
    author: "Visibility Workspace",
    time: "26 Aug · 10:04",
    content:
      "多謝你的寶貴意見。很抱歉午市期間讓你久等，我們會改善安排，期待你再次光臨錦汶館。",
    alt: "",
  },
] as const

export const integrations = [
  { name: "Google Business Profile", status: "Connection expired", capability: "Requires connection" as Capability, lastSync: "24 Aug · 18:04", scope: "Read profile and reviews only" },
  { name: "Instagram public evidence", status: "Provider unavailable", capability: "Beta" as Capability, lastSync: "22 Aug · 14:10", scope: "Public evidence; no publishing" },
  { name: "Public website", status: "Measured", capability: "Live" as Capability, lastSync: "25 Aug · 09:43", scope: "Public pages only" },
] as const

export const activity = [
  { time: "26 Aug · 10:18", actor: "Willy Lai · Owner", event: "Edited review reply", detail: "Created version 2 from version 1" },
  { time: "26 Aug · 10:04", actor: "Visibility Workspace", event: "Draft prepared", detail: "7 review replies · generation used no approved-delivery allowance (demo)" },
  { time: "25 Aug · 09:49", actor: "Visibility Workspace", event: "Action prioritised", detail: "Response-rate regression · priority factors recorded" },
  { time: "25 Aug · 09:47", actor: "Scanner", event: "Comparable scan completed", detail: "Score 62 · coverage 78% · 3 of 4 primary sources measured" },
] as const

export const analyticsEvents = [
  "landing_viewed", "business_search_started", "business_matched", "scan_started", "scan_terminal",
  "report_previewed", "report_unlocked", "claim_started", "workspace_claimed", "google_connect_started",
  "google_connected", "pricing_viewed", "checkout_started", "subscription_activated", "action_viewed",
  "agent_run_started", "draft_ready", "draft_approved", "delivery_completed", "scheduled_rescan_completed",
  "first_comparable_diff", "month_2_active", "subscription_cancelled",
] as const
