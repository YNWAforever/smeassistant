// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

vi.mock("next/navigation", () => ({ usePathname: () => "/en" }))

import { MotionDirector } from "@/components/motion-director"

type Observer = { callback: IntersectionObserverCallback; observed: Element[] }
let observers: Observer[] = []
let reducedMotion = false

class FakeIntersectionObserver {
  observed: Element[] = []
  constructor(public callback: IntersectionObserverCallback) { observers.push(this) }
  observe(element: Element) { this.observed.push(element) }
  unobserve(element: Element) { this.observed = this.observed.filter((item) => item !== element) }
  disconnect() { this.observed = [] }
}

function section(top: number) {
  const element = document.createElement("section")
  element.getBoundingClientRect = () => ({ top, bottom: top + 400, left: 0, right: 800, width: 800, height: 400, x: 0, y: top, toJSON: () => ({}) })
  return element
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  observers = []
  reducedMotion = false
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("no-preference") ? !reducedMotion : false, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 })
  container = document.createElement("div")
  container.className = "public-site"
  container.innerHTML = "<main></main>"
  document.body.append(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function mount(...tops: number[]) {
  const main = container.querySelector("main")!
  const sections = tops.map(section)
  main.append(...sections)
  root = createRoot(document.createElement("div"))
  act(() => root.render(<MotionDirector />))
  return sections
}

describe("MotionDirector", () => {
  it("never hides a section that is already on screen; only below-the-fold sections wait", () => {
    const [visible, below] = mount(120, 1800)
    expect(visible.dataset.reveal).toBeUndefined()
    expect(below.dataset.reveal).toBe("pending")
    expect(observers[0].observed).toEqual([below])
  })

  it("reveals a waiting section once it intersects", () => {
    const [, below] = mount(120, 1800)
    act(() => observers[0].callback([{ isIntersecting: true, target: below } as unknown as IntersectionObserverEntry], observers[0] as unknown as IntersectionObserver))
    expect(below.dataset.reveal).toBe("in")
  })

  it("does nothing under prefers-reduced-motion", () => {
    reducedMotion = true
    const [, below] = mount(120, 1800)
    expect(below.dataset.reveal).toBeUndefined()
    expect(observers).toHaveLength(0)
  })

  it("restores any still-waiting section on unmount so nothing stays invisible", () => {
    const [, below] = mount(120, 1800)
    act(() => root.unmount())
    expect(below.dataset.reveal).toBe("in")
    root = createRoot(document.createElement("div"))
  })
})
