// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { ApprovalBar } from "./approval-bar"
import { CommandPalette, matchCommands } from "./command-palette"
import { CoverageMeter } from "./coverage-meter"
import { EvidenceBadge } from "./evidence-badge"
import { FactTypeBadge, FactTypeLegend } from "./fact-type-badge"
import { KinnsoScoreDial } from "./score-dial"
import { StatCard } from "./stat-card"
import { EmptyState, ErrorState, PartialDataState, PermissionDenied } from "./states"
import { VersionDiff } from "./version-diff"

afterEach(cleanup)

describe("guardrail behaviour of the component kit", () => {
  it("StatCard shows Unknown, never 0, for a missing value and labels it Unknown", () => {
    const { container } = render(<StatCard label="Rating" value={null} factType="Observed" source="Google Maps" observedAt="2026-10-19T00:00:00Z" locale="en" />)
    expect(container.querySelector("[data-value]")?.getAttribute("data-value")).toBe("unknown")
    expect(container.textContent).not.toMatch(/\b0\b/)
    expect(container.querySelector("[data-fact-type]")?.getAttribute("data-fact-type")).toBe("Unknown")
  })

  it("StatCard shows a delta only for a comparable pair", () => {
    const { container, rerender } = render(<StatCard label="Score" value={62} factType="Observed" source="Scan" observedAt={null} delta={{ value: 4, comparable: false }} locale="en" />)
    expect(container.querySelector("[data-delta]")?.getAttribute("data-delta")).toBe("none")
    expect(container.textContent).toContain("Not comparable")
    expect(container.textContent).toContain("Date not recorded")
    rerender(<StatCard label="Score" value={62} factType="Observed" source="Scan" observedAt={null} delta={{ value: 4, comparable: true }} locale="en" />)
    expect(container.querySelector("[data-delta]")?.getAttribute("data-delta")).toBe("4")
  })

  it("ScoreDial renders 'no score yet' for a withheld score, not 0", () => {
    render(<KinnsoScoreDial score={null} coverage={35} locale="en" />)
    const dial = screen.getByRole("img")
    expect(dial.getAttribute("aria-label")).toContain("No score yet")
    expect(dial.getAttribute("aria-label")).not.toContain("0 out of")
  })

  it("CoverageMeter counts only measured sources and names every state", () => {
    render(<CoverageMeter locale="en" sources={[
      { key: "gbp", label: "Google Maps", state: "measured" },
      { key: "ig", label: "Instagram", state: "unavailable" },
      { key: "ai", label: "AI search", state: "pending" },
    ]} />)
    expect(screen.getByRole("img", { name: "1 of 3 sources measured" })).toBeTruthy()
    expect(screen.getByText(": Not available")).toBeTruthy()
  })

  it("FactTypeBadge explains itself to screen readers; the legend lists all six", () => {
    render(<FactTypeBadge type="Attributed" locale="zh-TW" />)
    expect(screen.getByText(/僅代表時間先後/)).toBeTruthy()
    const { container } = render(<FactTypeLegend locale="en" />)
    expect(container.querySelectorAll("[data-fact-type]")).toHaveLength(6)
  })

  it("EvidenceBadge says when the date is unknown instead of inventing one", () => {
    render(<EvidenceBadge source="Instagram" state="unavailable" observedAt={null} locale="zh-HK" />)
    expect(screen.getByText("未有記錄日期")).toBeTruthy()
  })

  it("ApprovalBar shows viewers why they cannot approve and offers no button", () => {
    render(<ApprovalBar versionNo={2} stateLabel="Draft" canApprove={false} onApprove={vi.fn()} locale="en" />)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText("View only: your role cannot approve")).toBeTruthy()
  })

  it("state components use alert for errors and status for partial or denied", () => {
    const retry = vi.fn()
    render(<ErrorState onRetry={retry} locale="en" />)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole("alert")).toBeTruthy()
    render(<><PartialDataState locale="en" /><PermissionDenied locale="en" /><EmptyState locale="en" /></>)
    expect(screen.getAllByRole("status")).toHaveLength(2)
  })

  it("VersionDiff labels insertions and deletions in text, not colour alone", () => {
    const { container } = render(<VersionDiff before="Thanks for coming" after="Thanks so much for coming" beforeNo={1} afterNo={2} locale="en" />)
    expect(container.querySelector("ins")?.textContent).toBe("Added: so much ")
  })

  it("CommandPalette filters by label, group and keywords and opens on Ctrl+K", () => {
    const items = [{ id: "a", label: "Actions", group: "Go to", href: "/a" }, { id: "b", label: "Billing", group: "Settings", keywords: "plan invoice" }]
    expect(matchCommands(items, "invoice").map((i) => i.id)).toEqual(["b"])
    render(<CommandPalette items={items} locale="en" />)
    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    const box = screen.getByRole("combobox")
    fireEvent.change(box, { target: { value: "bill" } })
    expect(screen.getAllByRole("option")).toHaveLength(1)
  })
})
