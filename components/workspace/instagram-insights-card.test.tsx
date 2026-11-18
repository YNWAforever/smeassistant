// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { InstagramInsightsCard } from "@/components/workspace/instagram-insights-card"
import type { InstagramInsightsPanel, InstagramInsightsValue } from "@/lib/publishing/instagram-insights-state"

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }))

const WORKSPACE = "22222222-2222-4222-8222-222222222222"

function value(overrides: Partial<InstagramInsightsValue> = {}): InstagramInsightsValue {
  return {
    scope: "account",
    mediaRef: null,
    metric: "impressions",
    periodEnd: "2026-11-17T08:00:00+0000",
    value: 120,
    factType: "Observed",
    unavailableReason: null,
    observedAt: "2026-11-18T00:00:00.000Z",
    ...overrides,
  }
}

function panel(overrides: Partial<InstagramInsightsPanel> = {}): InstagramInsightsPanel {
  return { enabled: true, connectionActive: true, observedAt: "2026-11-18T00:00:00.000Z", values: [value()], ...overrides }
}

function mount(overrides: { panel?: InstagramInsightsPanel; canPull?: boolean } = {}) {
  return render(
    <InstagramInsightsCard
      locale="en"
      workspaceId={WORKSPACE}
      workspaceSlug="kam-man-house"
      timezone="Asia/Hong_Kong"
      panel={overrides.panel ?? panel()}
      canPull={overrides.canPull ?? true}
    />,
  )
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  fetchMock.mockReset()
  refreshMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("InstagramInsightsCard", () => {
  it("renders a platform value with its metric definition and observed time", () => {
    mount()
    expect(screen.getByTestId("instagram-insights-card")).toBeTruthy()
    expect(screen.getByText("Impressions")).toBeTruthy()
    expect(screen.getByText("Times the content was displayed")).toBeTruthy()
    expect(screen.getByText("120")).toBeTruthy()
    expect(screen.getByText("18 Nov 2026")).toBeTruthy()
  })

  it("renders an unavailable metric with the stored reason and never as zero", () => {
    mount({ panel: panel({ values: [value({ metric: "reach", value: null, unavailableReason: "missing_permission" })] }) })
    expect(screen.queryByText("0")).toBeNull()
    expect(screen.getByText("Instagram has not granted the insights permission")).toBeTruthy()
  })

  it("pulls insights with a POST and refreshes the server data on success", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    mount()
    fireEvent.click(screen.getByTestId("instagram-insights-pull"))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/workspaces/${WORKSPACE}/instagram-insights/pull`)
    expect(init?.method).toBe("POST")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("shows a rate-limit message when the pull is refused", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }))
    mount()
    fireEvent.click(screen.getByTestId("instagram-insights-pull"))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Too many pulls today"))
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it("shows the not-connected notice with the integrations link and no pull button", () => {
    mount({ panel: panel({ connectionActive: false, values: [] }) })
    expect(screen.getByTestId("instagram-insights-not-connected")).toBeTruthy()
    expect(screen.queryByTestId("instagram-insights-pull")).toBeNull()
    expect(screen.getByText("Open integrations").closest("a")?.getAttribute("href")).toBe("/en/owner/kam-man-house/settings/integrations")
  })

  it("offers no pull action to a viewer but explains why", () => {
    mount({ canPull: false })
    expect(screen.queryByTestId("instagram-insights-pull")).toBeNull()
    expect(screen.getByText("Only the owner or a manager can pull insights.")).toBeTruthy()
  })

  it("lists recent media under a disclosure, labelled by the metric copy", () => {
    mount({ panel: panel({ values: [value(), value({ scope: "media", mediaRef: "17900000000000001", metric: "likes", value: 9, periodEnd: null })] }) })
    expect(screen.getByText("Recent media · Media 00000001")).toBeTruthy()
    expect(screen.getByText("Likes")).toBeTruthy()
    expect(screen.getByText("9")).toBeTruthy()
  })
})
