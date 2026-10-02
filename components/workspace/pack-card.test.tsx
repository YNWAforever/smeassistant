// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const clientMocks = vi.hoisted(() => ({ startPack: vi.fn(), runAction: vi.fn(), getOpenPack: vi.fn() }))
vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startPack: clientMocks.startPack,
  runAction: clientMocks.runAction,
  getOpenPack: clientMocks.getOpenPack,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house",
  useSearchParams: () => new URLSearchParams(),
}))

import { PackCard, type PackCardProps } from "@/components/workspace/pack-card"
import { packOf } from "@/components/workspace/pack-test-fixtures"
import { aiBudgetRefusal } from "@/lib/budgets/messages"
import { copy } from "@/lib/copy"

const text = copy.en.workspace.packs
const READY = { ok: true, data: { runId: "run-1", state: "succeeded", versionId: "v-1", versionNo: 1 } }
const DISCLOSURE = "Creates up to 3 drafts. Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery."

function mount(overrides: Partial<PackCardProps> = {}) {
  return render(
    <PackCard
      locale="en"
      workspaceId="ws-1"
      workspaceSlug="kam-man-house"
      role="owner"
      location={{ id: "loc-1", isAll: false }}
      inScope
      usage={{ approvedDeliveries: 1, allowance: 3 }}
      initialPack={null}
      {...overrides}
    />,
  )
}

async function pressStart() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.start })) })
}

describe("PackCard", () => {
  beforeEach(() => {
    clientMocks.startPack.mockReset()
    clientMocks.runAction.mockReset()
    clientMocks.getOpenPack.mockReset()
  })
  afterEach(cleanup)

  it("states the delivery unit and this month's usage before any request is made", () => {
    mount()
    expect(screen.getByText(`${DISCLOSURE} This month: 1 of 3 used.`)).toBeInTheDocument()
    expect(screen.getByText(copy.en.workspace.templates["review-response"].title)).toBeInTheDocument()
    expect(screen.getByText(copy.en.workspace.templates["website-basics"].summary)).toBeInTheDocument()
    expect(clientMocks.startPack).not.toHaveBeenCalled()
    expect(clientMocks.runAction).not.toHaveBeenCalled()
  })

  it("leaves the usage sentence out when the allowance is unlimited, or usage is unknown", () => {
    const { unmount } = mount({ usage: { approvedDeliveries: 7, allowance: null } })
    expect(screen.getByText(DISCLOSURE).textContent).not.toContain("This month")
    unmount()
    mount({ usage: null })
    expect(screen.getByText(DISCLOSURE).textContent).not.toContain("This month")
  })

  it("states the unit in each locale", () => {
    for (const locale of ["zh-HK", "zh-TW"] as const) {
      const t = copy[locale].workspace.packs
      const { unmount } = mount({ locale })
      expect(screen.getByText(t.disclosure + t.usage.replace("{used}", "1").replace("{allowance}", "3"))).toBeInTheDocument()
      unmount()
    }
  })

  it("starts the pack, then runs each item in turn in position order", async () => {
    clientMocks.startPack.mockResolvedValue({ ok: true, data: { pack: packOf(), created: true } })
    let finishFirst!: (value: unknown) => void
    clientMocks.runAction.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve })).mockResolvedValue(READY)
    mount()
    await pressStart()
    expect(clientMocks.startPack).toHaveBeenCalledWith("ws-1", "loc-1")
    // The second run does not start until the first has answered.
    expect(clientMocks.runAction).toHaveBeenCalledTimes(1)
    expect(clientMocks.runAction).toHaveBeenNthCalledWith(1, "act-1")
    expect(screen.getByText(text.states.generating)).toBeInTheDocument()
    await act(async () => { finishFirst(READY) })
    expect(clientMocks.runAction.mock.calls.map((call) => call[0])).toEqual(["act-1", "act-2", "act-3"])
    expect(screen.getAllByText(text.states.draftReady)).toHaveLength(3)
  })

  it("starts a workspace-wide pack with an explicit null location", async () => {
    clientMocks.startPack.mockResolvedValue({ ok: true, data: { pack: packOf(), created: true } })
    clientMocks.runAction.mockResolvedValue(READY)
    mount({ location: { id: null, isAll: false } })
    await pressStart()
    expect(clientMocks.startPack).toHaveBeenCalledWith("ws-1", null)
  })

  it("stops at ai_paused: one run, the later items stay not started, and the pause copy shows once", async () => {
    clientMocks.startPack.mockResolvedValue({ ok: true, data: { pack: packOf(), created: true } })
    clientMocks.runAction.mockResolvedValue({ ok: false, status: 503, error: "ai_paused" })
    mount()
    await pressStart()
    expect(clientMocks.runAction).toHaveBeenCalledTimes(1)
    expect(clientMocks.runAction).toHaveBeenCalledWith("act-1")
    const pause = aiBudgetRefusal("en", 503, "ai_paused")!
    expect(screen.getAllByText(pause)).toHaveLength(1)
    expect(screen.getAllByText(text.states.notStarted)).toHaveLength(2)
    expect(document.body.textContent ?? "").not.toContain("ai_paused")
  })

  it("stops at ai_budget_reached the same way", async () => {
    clientMocks.startPack.mockResolvedValue({ ok: true, data: { pack: packOf(), created: true } })
    clientMocks.runAction.mockResolvedValueOnce(READY).mockResolvedValueOnce({ ok: false, status: 429, error: "ai_budget_reached" })
    mount()
    await pressStart()
    expect(clientMocks.runAction.mock.calls.map((call) => call[0])).toEqual(["act-1", "act-2"])
    expect(screen.getAllByText(aiBudgetRefusal("en", 429, "ai_budget_reached")!)).toHaveLength(1)
    expect(document.body.textContent ?? "").not.toContain("ai_budget_reached")
  })

  it("skips an item whose action already has a draft, a requested change, or an approved version", async () => {
    const pack = packOf([{ version: { approval: "draft" } }, {}, { version: { approval: "approved" } }])
    clientMocks.startPack.mockResolvedValue({ ok: true, data: { pack, created: true } })
    clientMocks.runAction.mockResolvedValue(READY)
    mount()
    await pressStart()
    expect(clientMocks.runAction.mock.calls.map((call) => call[0])).toEqual(["act-2"])
  })

  it("skips an item whose action is finished", async () => {
    const pack = packOf([{ actionState: "completed" }, {}, {}])
    clientMocks.startPack.mockResolvedValue({ ok: true, data: { pack, created: false } })
    clientMocks.runAction.mockResolvedValue(READY)
    mount()
    await pressStart()
    expect(clientMocks.runAction.mock.calls.map((call) => call[0])).toEqual(["act-2", "act-3"])
  })

  it("shows the needs-your-facts state as a normal outcome, not a failure", async () => {
    clientMocks.startPack.mockResolvedValue({ ok: true, data: { pack: packOf(), created: true } })
    clientMocks.runAction.mockImplementation(async (id: string) => (id === "act-2" ? { ok: true, data: { runId: "r", state: "succeeded", factsNeeded: ["capacity"] } } : READY))
    mount()
    await pressStart()
    expect(screen.getByText(text.states.needsFacts)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: new RegExp(text.retry) })).toBeNull()
  })

  it("retries only the failed item", async () => {
    clientMocks.runAction.mockResolvedValue(READY)
    mount({ initialPack: packOf([{}, { run: "failed" }, {}]) })
    expect(screen.getByText(text.states.failed)).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: new RegExp(text.retry) })) })
    expect(clientMocks.runAction).toHaveBeenCalledTimes(1)
    expect(clientMocks.runAction).toHaveBeenCalledWith("act-2")
    expect(clientMocks.startPack).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: new RegExp(text.retry) })).toBeNull()
  })

  it("shows Review next for the first draft, and a link to the pack page", () => {
    mount({ initialPack: packOf([{ actionState: "in_progress", run: "succeeded", version: { approval: "draft" } }, {}, {}]) })
    expect(screen.getByRole("link", { name: text.reviewNext })).toHaveAttribute("href", "/en/owner/kam-man-house/actions/act-1")
    expect(screen.getByRole("link", { name: text.viewPack })).toHaveAttribute("href", "/en/owner/kam-man-house/packs/pack-1")
    expect(screen.getByText("1 of 3 drafted")).toBeInTheDocument()
  })

  it("gives a viewer no Start and no Retry", () => {
    const { unmount } = mount({ role: "viewer" })
    expect(screen.queryByRole("button", { name: text.start })).toBeNull()
    expect(screen.getByText(text.noPermission)).toBeInTheDocument()
    unmount()
    mount({ role: "viewer", initialPack: packOf([{ run: "failed" }]) })
    expect(screen.getByText(text.states.failed)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: new RegExp(text.retry) })).toBeNull()
  })

  it("gives a location-scoped manager no Start for a workspace-wide pack", () => {
    mount({ role: "manager", inScope: false, location: { id: null, isAll: false } })
    expect(screen.queryByRole("button", { name: text.start })).toBeNull()
    expect(clientMocks.startPack).not.toHaveBeenCalled()
  })

  it("lets an in-scope manager start", () => {
    mount({ role: "manager" })
    expect(screen.getByRole("button", { name: text.start })).toBeEnabled()
  })

  it("asks for a location when Home shows every location, with no Start, and lists the open packs", () => {
    mount({
      location: { id: null, isAll: true },
      inScope: false,
      locationPacks: [{ name: "Yik Yam", pack: packOf([{}, {}, {}], { id: "pack-9" }) }],
    })
    expect(screen.getByText(text.chooseLocation)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: text.start })).toBeNull()
    expect(screen.queryByText(DISCLOSURE)).toBeNull()
    expect(screen.getByRole("link", { name: /Yik Yam/ })).toHaveAttribute("href", "/en/owner/kam-man-house/packs/pack-9")
  })

  it("maps a refused start to owner copy, not the code", async () => {
    clientMocks.startPack.mockResolvedValue({ ok: false, status: 403, error: "forbidden" })
    mount()
    await pressStart()
    expect(screen.getByRole("alert")).toHaveTextContent(text.errors.forbidden)
    expect(clientMocks.runAction).not.toHaveBeenCalled()
    expect(document.body.textContent ?? "").not.toContain("forbidden")
    // Nothing was created, so the owner can try again.
    expect(screen.getByRole("button", { name: text.start })).toBeEnabled()
  })

  it("never renders an approve, export, reject or bulk control in any state", async () => {
    const forbidden = /approve|export|reject|核准|匯出|拒絕/i
    const states = [
      packOf(),
      packOf([{ run: "failed" }, { actionState: "needs_input", run: "succeeded" }, { version: { approval: "draft" } }]),
      packOf([{ version: { approval: "approved", delivery: "export_ready" } }, { version: { approval: "approved", delivery: "exported" } }, { version: { approval: "changes_requested" } }]),
    ]
    for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
      for (const initialPack of states) {
        const { unmount } = mount({ locale, initialPack })
        for (const button of screen.queryAllByRole("button")) expect(button.textContent ?? "", `${locale}`).not.toMatch(forbidden)
        unmount()
      }
    }
    // And mid-run, after Start.
    clientMocks.startPack.mockResolvedValue({ ok: true, data: { pack: packOf(), created: true } })
    clientMocks.runAction.mockResolvedValue(READY)
    mount()
    await pressStart()
    for (const button of screen.queryAllByRole("button")) expect(button.textContent ?? "").not.toMatch(forbidden)
  })
})
