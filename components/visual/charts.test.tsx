// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BeforeAfterCompare } from "./before-after"
import { ImpactEffortMatrix, quadrantOf } from "./impact-effort-matrix"
import { Sparkline, sparkSegments, TrendChip, type SparkPoint } from "./trend"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const point = (id: string, value: number | null, comparableToPrevious = true): SparkPoint => ({ id, at: `2026-0${id}-01T00:00:00Z`, value, comparableToPrevious })

describe("TrendChip", () => {
  it("shows a direction only for a comparable, known change", () => {
    const { container, rerender } = render(<TrendChip delta={4} comparable locale="en" />)
    expect(container.textContent).toBe("Up 4")
    rerender(<TrendChip delta={-2.5} comparable locale="en" />)
    expect(container.textContent).toBe("Down 2.5")
    rerender(<TrendChip delta={0} comparable locale="en" />)
    expect(container.textContent).toBe("No change")
  })

  it("never shows a number when the pair is not comparable or the change is unknown", () => {
    const { container, rerender } = render(<TrendChip delta={4} comparable={false} reason="SCORING_VERSION_MISMATCH" locale="en" />)
    expect(container.textContent).toContain("Not comparable")
    expect(container.textContent).toContain("scoring method changed")
    expect(container.textContent).not.toMatch(/\d/)
    rerender(<TrendChip delta={null} comparable locale="zh-HK" />)
    expect(container.textContent).toBe("未能比較")
  })
})

describe("Sparkline", () => {
  it("never joins points across a non-comparable scan or an unknown value", () => {
    const points = [point("1", 50), point("2", 55), point("3", 60, false), point("4", null), point("5", 62), point("6", 64)]
    expect(sparkSegments(points)).toEqual([[0, 1], [2], [4, 5]])
    const { container } = render(<Sparkline label="Score" points={points} locale="en" />)
    expect(container.querySelectorAll("polyline")).toHaveLength(2)
    expect(container.querySelectorAll("circle")).toHaveLength(5)
    expect(container.textContent).toContain("A break in the line means those scans cannot be compared.")
    expect(container.textContent).toContain("Unknown")
    expect(container.textContent).toContain("not comparable with the scan before")
  })

  it("summarises the latest value, or says it is unknown", () => {
    const { container, rerender } = render(<Sparkline label="Score" points={[point("1", 50), point("2", 58)]} locale="en" />)
    expect(container.textContent).toContain("Score: 2 scans, latest 58")
    expect(container.textContent).not.toContain("A break in the line")
    rerender(<Sparkline label="Score" points={[point("1", 50), point("2", null)]} locale="en" />)
    expect(container.textContent).toContain("Score: 2 scans, latest unknown")
  })
})

describe("ImpactEffortMatrix", () => {
  const items = [
    { id: "a", title: "Reply to reviews", impact: 0.8, effortMinutes: 10, href: "/a" },
    { id: "b", title: "Translate menu", impact: 0.7, effortMinutes: 25 },
    { id: "c", title: "Add highlights", impact: 0.2, effortMinutes: 5 },
    { id: "d", title: "Local SEO brief", impact: 0.3, effortMinutes: 30 },
  ]

  it("places actions in quadrants and lists quick wins first", () => {
    expect(quadrantOf(items[0]!, 30)).toBe("quickWins")
    expect(quadrantOf(items[1]!, 30)).toBe("plan")
    expect(quadrantOf(items[2]!, 30)).toBe("fillIns")
    expect(quadrantOf(items[3]!, 30)).toBe("later")
    render(<ImpactEffortMatrix items={[...items].reverse()} locale="en" />)
    const rows = screen.getAllByRole("listitem")
    expect(rows.map((row) => row.getAttribute("data-quadrant"))).toEqual(["quickWins", "plan", "fillIns", "later"])
    expect(screen.getByRole("link", { name: "Reply to reviews" }).getAttribute("href")).toBe("/a")
  })

  it("is labelled Recommended and says it is not a measured result", () => {
    const { container } = render(<ImpactEffortMatrix items={items} locale="en" />)
    expect(container.querySelector("[data-fact-type]")?.getAttribute("data-fact-type")).toBe("Recommended")
    expect(container.textContent).toContain("not a measured result")
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })
})

describe("BeforeAfterCompare", () => {
  const side = (text: string) => ({ observedAt: "2026-10-01T00:00:00Z", content: <p>{text}</p> })

  it("is always labelled Attributed, not proven", () => {
    const { container } = render(<BeforeAfterCompare before={side("old")} after={side("new")} comparable locale="en" />)
    expect(container.textContent).toContain("Attributed, not proven")
    expect(container.querySelector("[data-fact-type]")?.getAttribute("data-fact-type")).toBe("Attributed")
  })

  it("refuses to place non-comparable scans side by side", () => {
    const { container } = render(<BeforeAfterCompare before={side("old")} after={side("new")} comparable={false} reason="NO_SHARED_MEASURED_MODULE" locale="en" />)
    expect(container.textContent).not.toContain("old")
    expect(container.textContent).toContain("No source was measured in both scans.")
  })

  it("offers a labelled slider in slider mode", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
    render(<BeforeAfterCompare before={side("old")} after={side("new")} comparable mode="slider" locale="zh-TW" />)
    expect(screen.getByRole("slider", { name: "拖曳以比較前後" })).toBeTruthy()
  })
})
