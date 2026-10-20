// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ScanProgress } from "./scan-progress"
import { ApprovalFlow, LoopStepper } from "./steps"

afterEach(cleanup)

describe("LoopStepper", () => {
  it("marks earlier steps done and names the current step", () => {
    const { container } = render(<LoopStepper current="approve" locale="en" />)
    const steps = [...container.querySelectorAll("li")]
    expect(steps.map((step) => step.getAttribute("data-status"))).toEqual(["done", "done", "current", "upcoming", "upcoming"])
    expect(screen.getByRole("group", { name: "Your progress" })).toBeTruthy()
    const current = container.querySelector('[aria-current="step"]')
    expect(current?.textContent).toContain("Approve")
    expect(current?.textContent).toContain("Step 3 of 5")
  })

  it("fills the line by scale, so the layout never moves", () => {
    const { container } = render(<LoopStepper current="deliver" locale="zh-HK" />)
    const fill = container.querySelector<HTMLElement>(".k-steps-fill")
    expect(fill?.style.getPropertyValue("--progress")).toBe("0.75")
    expect(container.textContent).toContain("交付")
  })
})

describe("ApprovalFlow", () => {
  it("puts a lock before Approved and says nothing goes out without approval", () => {
    const { container } = render(<ApprovalFlow state="needsApproval" locale="en" />)
    const approved = [...container.querySelectorAll("li")].find((li) => li.textContent?.includes("Approved"))
    expect(approved?.querySelector(".k-step-lock")).toBeTruthy()
    expect(container.textContent).toContain("nothing goes out until you approve")
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("Needs approval")
  })
})

describe("ScanProgress", () => {
  const sources = [
    { key: "search", label: "Google Search", state: "measured" as const },
    { key: "maps", label: "Google Maps", state: "pending" as const },
    { key: "ai", label: "AI search", state: "failed" as const },
    { key: "ig", label: "Instagram", state: "unavailable" as const },
    { key: "web", label: "Website", state: "pending" as const },
  ]

  it("announces only the summary and keeps failed and unavailable distinct", () => {
    const { container } = render(<ScanProgress sources={sources} locale="en" />)
    expect(screen.getByRole("status").textContent).toBe("3 of 5 sources checked")
    expect(container.textContent).toContain("Check failed")
    expect(container.textContent).toContain("Not available")
    expect(container.querySelectorAll(".k-pulse")).toHaveLength(2)
  })

  it("says when every source is checked", () => {
    render(<ScanProgress sources={sources.map((s) => ({ ...s, state: "measured" as const }))} locale="zh-TW" />)
    expect(screen.getByRole("status").textContent).toBe("所有來源皆已檢查")
  })
})
