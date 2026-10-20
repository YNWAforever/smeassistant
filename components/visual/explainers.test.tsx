// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EmptyState, ErrorState, PermissionDenied } from "@/components/kinnso/states"
import { illustrationKinds } from "@/lib/copy-visual"

import { EvidencePreview } from "./evidence-preview"
import { EmptyIllustration } from "./illustrations"
import { ApprovalDemo, InlineExplainer } from "./inline-explainer"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("EvidencePreview", () => {
  it("shows source, observed date, fact type and limitation", () => {
    const { container } = render(
      <EvidencePreview source="Google Maps" observedAt="2026-10-19T06:00:00Z" factType="Observed" snippet="Great noodles" limitation="Newest 5 reviews only" href="https://maps.example/x" locale="en" />,
    )
    expect(container.textContent).toContain("Google Maps")
    expect(container.textContent).toContain("Observed Oct 19, 2026")
    expect(container.textContent).toContain("Limitation: Newest 5 reviews only")
    expect(screen.getByRole("link", { name: "View source" }).getAttribute("rel")).toContain("noopener")
  })

  it("renders nothing without a source or a valid observed date", () => {
    expect(render(<EvidencePreview source=" " observedAt="2026-10-19T06:00:00Z" factType="Observed" locale="en" />).container.innerHTML).toBe("")
    expect(render(<EvidencePreview source="Instagram" observedAt="not a date" factType="Observed" locale="en" />).container.innerHTML).toBe("")
  })
})

describe("InlineExplainer", () => {
  it("names the question and keeps the demo paused until hovered", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
    render(<InlineExplainer label="coverage" answer="How many sources we could measure." demo={<ApprovalDemo />} locale="en" />)
    fireEvent.click(screen.getByRole("button", { name: "What is coverage?" }))
    const demo = document.querySelector<HTMLElement>(".k-demo")
    expect(demo?.getAttribute("aria-hidden")).toBe("true")
    expect(demo?.hasAttribute("tabindex")).toBe(false)
    fireEvent.pointerLeave(demo!.parentElement!)
    expect(demo?.hasAttribute("data-playing")).toBe(false)
    fireEvent.pointerEnter(demo!.parentElement!)
    expect(demo?.hasAttribute("data-playing")).toBe(true)
    expect(screen.getByText("How many sources we could measure.")).toBeTruthy()
  })
})

describe("illustrations and states", () => {
  it("draws every kind as a decorative SVG", () => {
    for (const kind of illustrationKinds) {
      const { container } = render(<EmptyIllustration kind={kind} />)
      const svg = container.querySelector("svg")
      expect(svg?.getAttribute("aria-hidden")).toBe("true")
      expect(svg?.getAttribute("data-kind")).toBe(kind)
      cleanup()
    }
  })

  it("an empty state kind brings its copy and one next-step button", () => {
    render(<EmptyState kind="allDone" actionHref="/en/insights" locale="en" />)
    expect(screen.getByRole("heading", { name: "All caught up" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "View insights" }).getAttribute("href")).toBe("/en/insights")
  })

  it("error and permission states use the shared set", () => {
    const { container } = render(<><ErrorState locale="en" /><PermissionDenied locale="en" /></>)
    expect([...container.querySelectorAll("svg[data-kind]")].map((svg) => svg.getAttribute("data-kind"))).toEqual(["error", "denied"])
  })
})
