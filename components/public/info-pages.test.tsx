// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/methodology",
  useSearchParams: () => new URLSearchParams(),
}))

import { MethodologyPage } from "./methodology"
import { TrustPage } from "./trust"

function root(node: React.ReactElement) {
  const div = document.createElement("div")
  div.innerHTML = renderToStaticMarkup(node)
  return div
}

describe("MethodologyPage", () => {
  it("shows a withheld score as 'No score yet', never 0, and a missing source as coverage", () => {
    const page = root(<MethodologyPage locale="en" />)
    expect(page.querySelector("#coverage")?.textContent).toContain("No score yet")
    expect(page.querySelector('[data-score="none"]')).not.toBeNull()
    expect(page.textContent).toContain("4 of 5 sources measured")
  })

  it("explains non-comparable change with a reason instead of a number", () => {
    const page = root(<MethodologyPage locale="en" />)
    const chips = [...page.querySelectorAll('[data-trend="none"]')].filter((el) => el.classList.contains("k-trend"))
    expect(chips).toHaveLength(2)
    for (const chip of chips) expect(chip.textContent).not.toMatch(/\d/)
  })

  it("carries the comparison table and work stages without agent names", () => {
    const page = root(<MethodologyPage locale="zh-TW" />)
    expect(page.querySelector("caption")?.textContent).toBe("Kinnso OS 與其他常見選擇的類別比較")
    expect(page.textContent).not.toMatch(/Visibility Scout|Priority Coach|Quality Studio/)
    expect(page.textContent).not.toContain("SME Scanner")
    expect(page.textContent).toContain("評分 2026-08-16")
  })
})

describe("TrustPage", () => {
  it("shows the approval boundary with a lock before Approved", () => {
    const page = root(<TrustPage locale="en" />)
    const approved = [...page.querySelectorAll(".k-step")].find((step) => step.textContent?.includes("Approved"))
    expect(approved?.querySelector(".k-step-lock")).not.toBeNull()
    expect(page.textContent).toContain("nothing goes out until you confirm")
  })

  it("keeps the reviewed data-boundary rows and the policy link", () => {
    const page = root(<TrustPage locale="zh-HK" />)
    expect(page.querySelectorAll(".pl-dl > div").length).toBeGreaterThan(0)
    expect(page.querySelector('a[href="/zh-HK/legal/privacy"]')).not.toBeNull()
  })
})
