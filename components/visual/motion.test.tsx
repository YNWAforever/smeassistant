// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useCountUp, useReducedMotion, useReveal } from "./motion"

function mockMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

let frames: FrameRequestCallback[] = []
function flushFrames(at: number) {
  const pending = frames
  frames = []
  pending.forEach((callback) => callback(at))
}

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
  delete document.documentElement.dataset.motion
})

describe("reduced motion", () => {
  it("follows the device setting", () => {
    mockMotion(true)
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true)
    cleanup()
    mockMotion(false)
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false)
  })

  it("honours the manual switch even when the device allows motion", () => {
    mockMotion(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
    act(() => { document.documentElement.dataset.motion = "reduce" })
    return new Promise<void>((resolve) => setTimeout(() => { expect(result.current).toBe(true); resolve() }, 0))
  })

  it("stays still when the engine cannot tell", () => {
    vi.stubGlobal("matchMedia", undefined)
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true)
  })
})

describe("useCountUp", () => {
  it("renders the real value first, so server HTML never shows a placeholder", () => {
    mockMotion(false)
    expect(renderHook(() => useCountUp(62)).result.current).toBe(62)
  })

  it("counts from the old value to a new one when motion is allowed", () => {
    mockMotion(false)
    const { result, rerender } = renderHook(({ target }) => useCountUp(target), { initialProps: { target: 50 } })
    rerender({ target: 70 })
    act(() => flushFrames(300))
    expect(result.current).toBeGreaterThan(50)
    expect(result.current).toBeLessThan(70)
    act(() => flushFrames(600))
    expect(result.current).toBe(70)
  })

  it("jumps straight to the new value under reduced motion", () => {
    mockMotion(true)
    const { result, rerender } = renderHook(({ target }) => useCountUp(target), { initialProps: { target: 50 } })
    rerender({ target: 70 })
    expect(result.current).toBe(70)
    expect(frames).toHaveLength(0)
  })

  it("jumps when animation is turned off for this change (not comparable)", () => {
    mockMotion(false)
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, { animate: false }), { initialProps: { target: 50 } })
    rerender({ target: 70 })
    expect(result.current).toBe(70)
  })

  it("lands on the target when interrupted", () => {
    mockMotion(false)
    const { result, rerender, unmount } = renderHook(({ target }) => useCountUp(target), { initialProps: { target: 0 } })
    rerender({ target: 10 })
    act(() => flushFrames(100))
    expect(result.current).toBeLessThan(10)
    rerender({ target: 20 })
    act(() => flushFrames(5000))
    expect(result.current).toBe(20)
    unmount()
  })
})

describe("useReveal", () => {
  function Probe({ onState }: { onState: (state: string) => void }) {
    const [ref, state] = useReveal<HTMLDivElement>()
    onState(state)
    return <div ref={ref} />
  }

  it("never hides content that is already on screen", () => {
    mockMotion(false)
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} })
    const states: string[] = []
    render(<Probe onState={(state) => states.push(state)} />)
    expect(states.at(-1)).toBe("static")
  })

  it("holds below-the-fold content until it arrives, then plays once", () => {
    mockMotion(false)
    let trigger: (entries: Array<{ isIntersecting: boolean }>) => void = () => {}
    vi.stubGlobal("IntersectionObserver", class { constructor(callback: typeof trigger) { trigger = callback } observe() {} disconnect() {} })
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 5000 } as DOMRect)
    const states: string[] = []
    render(<Probe onState={(state) => states.push(state)} />)
    expect(states.at(-1)).toBe("pending")
    act(() => trigger([{ isIntersecting: true }]))
    expect(states.at(-1)).toBe("in")
  })

  it("stays static under reduced motion", () => {
    mockMotion(true)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 5000 } as DOMRect)
    const states: string[] = []
    render(<Probe onState={(state) => states.push(state)} />)
    expect(states.at(-1)).toBe("static")
  })
})

describe("motion.css", () => {
  it("animates only inside the no-preference block, so the still state is the default", async () => {
    const { readFileSync } = await import("node:fs")
    const css = readFileSync(`${process.cwd()}/app/styles/motion.css`, "utf8")
    const start = css.indexOf("@media (prefers-reduced-motion: no-preference)")
    const end = css.indexOf("@keyframes")
    expect(start).toBeGreaterThan(-1)
    const outside = css.slice(0, start) + css.slice(end)
    expect(outside).not.toMatch(/\b(animation|transition)\s*:/)
    for (const rule of css.slice(start, end).match(/^\s+:root[^{]*\{/gm) ?? []) expect(rule).toContain(':not([data-motion="reduce"])')
  })
})
