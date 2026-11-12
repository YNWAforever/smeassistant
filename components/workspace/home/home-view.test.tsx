import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/shop",
  useSearchParams: () => new URLSearchParams(),
}))

import { HomeView } from "./home-view"
import type { HomeBrief } from "@/lib/workspace/queries-pages"
import type { ActionOverview } from "@/lib/workspace/overview"

const action = {
  id: "action-1",
  templateKey: "google-post",
  title: { en: "Post this week's update", "zh-HK": "貼今個星期更新", "zh-TW": "貼這個星期更新" },
  summary: { en: "A short update is ready to review.", "zh-HK": "有個短更新等你睇。", "zh-TW": "有個短更新等你確認。" },
  priority: "high",
  effortMinutes: 10,
  displayPhase: { en: "Draft", "zh-HK": "草稿", "zh-TW": "草稿" },
  evidence: {
    factType: "Observed",
    detail: { en: "The profile has no post this week.", "zh-HK": "今個星期未有帖文。", "zh-TW": "這個星期沒有貼文。" },
    observedAt: "2026-11-10T02:00:00.000Z",
  },
  latestVersion: { id: "version-1", versionNo: 2, approvalState: "draft", deliveryState: "not_started" },
} as unknown as ActionOverview

function brief(overrides: Partial<HomeBrief> = {}): HomeBrief {
  return {
    locationSlug: "branch",
    location: null,
    snapshot: { id: "snap-1" } as HomeBrief["snapshot"],
    priority: action,
    openActions: [action],
    openActionCount: 3,
    month: { resolved: 2, regressed: null, awaitingApproval: 1, completed: 4, measured: 3 },
    drafts: 1,
    ...overrides,
  } as HomeBrief
}

describe("owner home v2", () => {
  it("leads with one next step and its action link", () => {
    const html = renderToStaticMarkup(<HomeView locale="en" workspaceSlug="shop" timezone="Asia/Hong_Kong" locations={[{ slug: "branch", name: "Branch" }]} brief={brief()} role="owner" />)
    expect(html).toContain("One next step, the drafts waiting for you")
    expect(html).toContain("Next step")
    expect(html).toContain("Post this week&#x27;s update")
    expect(html).toContain("/en/owner/shop/actions/action-1?version=version-1")
    expect(html).toContain("Review draft")
  })

  it("offers one Kinnso entry without a second assistant launcher", () => {
    const html = renderToStaticMarkup(<HomeView locale="en" workspaceSlug="shop" timezone="Asia/Hong_Kong" locations={[]} brief={brief()} role="owner" />)
    expect(html).toContain("Ask Kinnso to write or change something")
    expect(html).toContain("ask=write_ig")
    expect(html).not.toContain("assistant-launcher")
  })

  it("shows the month as effort counts and never a score", () => {
    const html = renderToStaticMarkup(<HomeView locale="en" workspaceSlug="shop" timezone="Asia/Hong_Kong" locations={[]} brief={brief()} role="owner" />)
    expect(html).toContain("This month")
    expect(html).toContain(">4<")
    expect(html).not.toMatch(/score|overall/i)
  })

  it("asks for one location instead of aggregating an all-locations brief", () => {
    const html = renderToStaticMarkup(<HomeView locale="en" workspaceSlug="shop" timezone="Asia/Hong_Kong" locations={[{ slug: "a", name: "A" }, { slug: "b", name: "B" }]} brief={brief({ locationSlug: "all", priority: null, openActions: [], openActionCount: 0 })} role="owner" />)
    expect(html).toContain("Choose one location to see its next step")
    expect(html).not.toContain("aggregate")
  })

  it("does not show a blank source or an empty evidence detail in the why disclosure", () => {
    const withoutDetail = {
      ...action,
      evidence: { factType: "Observed", source: "", detail: { en: "", "zh-HK": "", "zh-TW": "" }, observedAt: "2026-11-10T02:00:00.000Z" },
    } as unknown as ActionOverview
    const html = renderToStaticMarkup(<HomeView locale="en" workspaceSlug="shop" timezone="Asia/Hong_Kong" locations={[]} brief={brief({ priority: withoutDetail })} role="owner" />)
    expect(html).toContain("Why this?")
    expect(html).toContain("Observed ·")
    expect(html).not.toContain("Observed  ·")
    expect(html).not.toContain("<p></p>")
  })

  it("starts an unscanned shop with the free scan", () => {
    const html = renderToStaticMarkup(<HomeView locale="en" workspaceSlug="shop" timezone="Asia/Hong_Kong" locations={[{ slug: "a", name: "A" }]} brief={brief({ snapshot: null, priority: null, openActions: [], openActionCount: 0 })} role="owner" />)
    expect(html).toContain("Start with one free scan")
    expect(html).toContain("/en/scan")
  })
})
