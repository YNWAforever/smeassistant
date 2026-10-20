// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMock }))

import { ApprovedCheck, CopyExportButton, FirstApprovalPulse, UsageMeter } from "./feedback"
import { PageTransition } from "./page-transition"

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe("ApprovedCheck", () => {
  it("draws the check only when asked to play", () => {
    const { container, rerender } = render(<ApprovedCheck locale="en" />)
    expect(container.querySelector(".k-check-draw")).toBeNull()
    expect(container.textContent).toBe("Approved")
    rerender(<ApprovedCheck play locale="en" />)
    expect(container.querySelector(".k-check-draw")).toBeTruthy()
  })
})

describe("CopyExportButton", () => {
  it("turns into a check and raises a toast on success", async () => {
    render(<CopyExportButton mode="copy" onAction={() => true} locale="en" />)
    const button = screen.getByRole("button", { name: "Copy text" })
    await act(async () => { fireEvent.click(button) })
    expect(button.getAttribute("data-state")).toBe("done")
    expect(screen.getByRole("button", { name: "Copied" })).toBe(button)
    expect(toastMock.success).toHaveBeenCalledWith("Copied. Paste it where you publish.")
  })

  it("says nothing was published when exporting, and reports failure", async () => {
    const { rerender } = render(<CopyExportButton mode="export" onAction={async () => true} locale="en" />)
    await act(async () => { fireEvent.click(screen.getByRole("button")) })
    expect(toastMock.success).toHaveBeenCalledWith("Exported. Nothing is published automatically.")
    rerender(<CopyExportButton mode="export" onAction={async () => { throw new Error("network") }} locale="en" />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2100)) })
    await act(async () => { fireEvent.click(screen.getByRole("button")) })
    expect(toastMock.error).toHaveBeenCalledWith("That did not work. Try again.")
  })
})

describe("UsageMeter", () => {
  it("is a labelled meter for a plan with an allowance", () => {
    render(<UsageMeter used={2} allowance={3} locale="en" />)
    const meter = screen.getByRole("meter", { name: "2 of 3 approved deliveries this month" })
    expect(meter.getAttribute("aria-valuenow")).toBe("2")
  })

  it("notes a counted delivery only when usage goes up", () => {
    const { rerender, container } = render(<UsageMeter used={1} allowance={3} locale="en" />)
    expect(container.textContent).not.toContain("Delivery counted")
    rerender(<UsageMeter used={2} allowance={3} locale="en" />)
    expect(screen.getByRole("status").textContent).toContain("Delivery counted")
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("2")
  })

  it("shows an unlimited plan as a count without a bar", () => {
    const { container } = render(<UsageMeter used={7} allowance={null} locale="zh-HK" />)
    expect(screen.queryByRole("meter")).toBeNull()
    expect(container.textContent).toContain("本月已核准交付 7 次")
  })
})

describe("FirstApprovalPulse", () => {
  it("shows once per workspace in this browser, and only when active", () => {
    const { container, unmount } = render(<FirstApprovalPulse active storageKey="ws-1" locale="en"><p>card</p></FirstApprovalPulse>)
    expect(container.textContent).toContain("Your first approved action")
    unmount()
    const again = render(<FirstApprovalPulse active storageKey="ws-1" locale="en"><p>card</p></FirstApprovalPulse>)
    expect(again.container.textContent).toBe("card")
    const inactive = render(<FirstApprovalPulse active={false} storageKey="ws-2" locale="en"><p>card</p></FirstApprovalPulse>)
    expect(inactive.container.textContent).toBe("card")
    expect(window.localStorage.getItem("kinnso-first-approval:ws-2")).toBeNull()
  })
})

describe("PageTransition", () => {
  it("is a CSS class wrapper with no script", () => {
    const { container } = render(<PageTransition><main>page</main></PageTransition>)
    expect(container.firstElementChild?.className).toBe("k-page-enter")
  })
})
