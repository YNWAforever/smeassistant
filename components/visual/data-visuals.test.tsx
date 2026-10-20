// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CoverageMeter } from "./coverage-meter"
import { FactTypeBadge, FactTypeLegend } from "./fact-type"
import { ScoreDial } from "./score-dial"

let frames: FrameRequestCallback[] = []
function mockMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}
function flush(at: number) {
  const pending = frames
  frames = []
  pending.forEach((callback) => callback(at))
}
const shownNumber = (container: HTMLElement) => container.querySelector("svg text")?.textContent

beforeEach(() => {
  frames = []
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.spyOn(performance, "now").mockReturnValue(0)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("ScoreDial", () => {
  it("renders 'no score yet' for a withheld score, not 0", () => {
    mockMotion(false)
    const { container } = render(<ScoreDial score={null} coverage={35} locale="en" />)
    const dial = screen.getByRole("img")
    expect(dial.getAttribute("aria-label")).toContain("No score yet")
    expect(dial.getAttribute("aria-label")).not.toContain("0 out of")
    expect(shownNumber(container)).toBe("—")
    expect(container.querySelector(".k-score-arc")).toBeNull()
  })

  it("renders the real score on first paint and names it with coverage", () => {
    mockMotion(false)
    const { container } = render(<ScoreDial score={61.6} coverage={60} locale="en" />)
    expect(shownNumber(container)).toBe("62")
    expect(screen.getByRole("img", { name: "62 out of 100, coverage 60%" })).toBeTruthy()
  })

  it("counts from the old score to the new one only for a comparable rescan", () => {
    mockMotion(false)
    const { container, rerender } = render(<ScoreDial score={50} coverage={60} comparable locale="en" />)
    rerender(<ScoreDial score={70} coverage={60} comparable locale="en" />)
    act(() => flush(300))
    const mid = Number(shownNumber(container))
    expect(mid).toBeGreaterThan(50)
    expect(mid).toBeLessThan(70)
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("70 out of")
  })

  it("jumps when the rescan is not comparable", () => {
    mockMotion(false)
    const { container, rerender } = render(<ScoreDial score={50} coverage={60} locale="en" />)
    rerender(<ScoreDial score={70} coverage={60} locale="en" />)
    expect(shownNumber(container)).toBe("70")
    expect(frames).toHaveLength(0)
  })

  it("replays without motion as a jump under reduced motion", () => {
    mockMotion(true)
    const { container, rerender } = render(<ScoreDial score={62} coverage={60} replay={0} locale="en" />)
    rerender(<ScoreDial score={62} coverage={60} replay={1} locale="en" />)
    expect(shownNumber(container)).toBe("62")
    expect(frames).toHaveLength(0)
  })
})

describe("CoverageMeter", () => {
  const sources = [
    { key: "gbp", label: "Google Maps", state: "measured" as const },
    { key: "ig", label: "Instagram", state: "unavailable" as const },
    { key: "ai", label: "AI search", state: "pending" as const },
  ]

  it("counts only measured sources and names every state", () => {
    render(<CoverageMeter locale="en" sources={sources} />)
    expect(screen.getByRole("img", { name: "1 of 3 sources measured" })).toBeTruthy()
    expect(screen.getByText(": Not available")).toBeTruthy()
  })

  it("shimmers only pending segments, and the shimmer is decorative", () => {
    const { container } = render(<CoverageMeter locale="en" sources={sources} />)
    const shimmers = container.querySelectorAll(".k-shimmer")
    expect(shimmers).toHaveLength(1)
    expect(shimmers[0]?.closest("[data-state]")?.getAttribute("data-state")).toBe("pending")
    expect(shimmers[0]?.textContent).toBe("")
  })

  it("flashes a segment when its state changes, never on first render", () => {
    const { container, rerender } = render(<CoverageMeter locale="en" sources={sources} />)
    expect(container.querySelectorAll(".k-changed")).toHaveLength(0)
    rerender(<CoverageMeter locale="en" sources={sources.map((s) => (s.key === "ai" ? { ...s, state: "measured" as const } : s))} />)
    const changed = container.querySelectorAll(".k-changed")
    expect(changed).toHaveLength(1)
    expect(changed[0]?.getAttribute("data-state")).toBe("measured")
  })
})

describe("FactTypeBadge", () => {
  it("explains itself to screen readers; the legend lists all six", () => {
    render(<FactTypeBadge type="Attributed" locale="zh-TW" />)
    expect(screen.getByText(/僅代表時間先後/)).toBeTruthy()
    const { container } = render(<FactTypeLegend locale="en" />)
    expect(container.querySelectorAll("[data-fact-type]")).toHaveLength(6)
  })

  it("is a plain label by default and a focusable chip with explain", () => {
    const { container, rerender } = render(<FactTypeBadge type="Estimated" locale="en" />)
    expect(container.querySelector("button")).toBeNull()
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
    rerender(<FactTypeBadge type="Estimated" locale="en" explain />)
    const chip = screen.getByRole("button", { name: /Estimated\s*: Worked out from a sample/ })
    fireEvent.focus(chip)
    expect(screen.getAllByRole("tooltip", { hidden: true })[0]?.textContent).toContain("Worked out from a sample")
  })
})
