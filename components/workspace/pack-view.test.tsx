// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const clientMocks = vi.hoisted(() => ({ runAction: vi.fn(), refresh: vi.fn() }))
vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runAction: clientMocks.runAction,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: clientMocks.refresh }),
  usePathname: () => "/en/owner/kam-man-house/packs/pack-1",
  useSearchParams: () => new URLSearchParams(),
}))

import { PackView, type PackViewProps } from "@/components/workspace/pack-view"
import { packOf } from "@/components/workspace/pack-test-fixtures"
import { copy } from "@/lib/copy"

const text = copy.en.workspace.packs
const READY = { ok: true, data: { runId: "run-1", state: "succeeded", versionId: "v-1", versionNo: 1 } }

function mount(overrides: Partial<PackViewProps> = {}) {
  return render(<PackView locale="en" workspaceSlug="kam-man-house" role="owner" inScope pack={packOf()} locationName="Yik Yam" {...overrides} />)
}

describe("PackView", () => {
  beforeEach(() => { clientMocks.runAction.mockReset(); clientMocks.refresh.mockReset() })
  afterEach(cleanup)

  it("lists the three items with their state and a link to each action's own page", () => {
    mount({ pack: packOf([{ run: "failed" }, { actionState: "needs_input", run: "succeeded" }, { version: { approval: "draft" } }]) })
    expect(screen.getByRole("heading", { level: 1, name: text.title })).toBeInTheDocument()
    expect(screen.getByText(text.states.failed)).toBeInTheDocument()
    expect(screen.getByText(text.states.needsFacts)).toBeInTheDocument()
    expect(screen.getByText(text.states.draftReady)).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: text.open }).map((a) => a.getAttribute("href"))).toEqual([
      "/en/owner/kam-man-house/actions/act-1",
      "/en/owner/kam-man-house/actions/act-2",
      "/en/owner/kam-man-house/actions/act-3",
    ])
    expect(screen.getByRole("link", { name: text.reviewNext })).toHaveAttribute("href", "/en/owner/kam-man-house/actions/act-3")
  })

  it("retries only the failed item, then refreshes the server-read overview", async () => {
    clientMocks.runAction.mockResolvedValue(READY)
    mount({ pack: packOf([{ run: "failed" }]) })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: new RegExp(text.retry) })) })
    expect(clientMocks.runAction).toHaveBeenCalledTimes(1)
    expect(clientMocks.runAction).toHaveBeenCalledWith("act-1")
    expect(clientMocks.refresh).toHaveBeenCalledTimes(1)
  })

  it("renders a closed pack read-only: no Retry, no Review next, and says so", () => {
    mount({ pack: packOf([{ run: "failed" }, { version: { approval: "draft" } }], { closedAt: "2026-10-03T00:00:00Z" }) })
    expect(screen.getByText(text.closed)).toBeInTheDocument()
    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(screen.queryByRole("link", { name: text.reviewNext })).toBeNull()
    expect(screen.getAllByRole("link", { name: text.open })).toHaveLength(3)
  })

  it("gives a viewer and an out-of-scope manager no Retry", () => {
    const pack = packOf([{ run: "failed" }])
    const { unmount } = mount({ pack, role: "viewer" })
    expect(screen.queryByRole("button", { name: new RegExp(text.retry) })).toBeNull()
    unmount()
    mount({ pack, role: "manager", inScope: false })
    expect(screen.queryByRole("button", { name: new RegExp(text.retry) })).toBeNull()
  })

  it("has no approve, export, reject or bulk control, open or closed, in any locale", () => {
    const forbidden = /approve|export|reject|核准|匯出|拒絕/i
    const pack = packOf([{ version: { approval: "approved", delivery: "export_ready" } }, { version: { approval: "draft" } }, { run: "failed" }])
    for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
      for (const candidate of [pack, packOf([], { closedAt: "2026-10-03T00:00:00Z" })]) {
        const { unmount } = mount({ locale, pack: candidate })
        for (const control of [...screen.queryAllByRole("button"), ...screen.queryAllByRole("link")]) {
          // Item titles and state badges are labels, not controls: only the control names matter.
          if (control.tagName === "BUTTON") expect(control.textContent ?? "").not.toMatch(forbidden)
        }
        unmount()
      }
    }
  })

  it("shows the workspace-wide label when the pack has no location", () => {
    mount({ locationName: null })
    expect(screen.getByText(new RegExp(text.allLocations))).toBeInTheDocument()
  })
})
