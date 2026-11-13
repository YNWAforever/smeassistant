// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { StudioContextSummary } from "@/lib/studio/types"
import { StudioContextPanel } from "./context-panel"

const summary: StudioContextSummary = { locationName: "Yik Yam", latestScan: null, openActions: [], waitingVersions: 0, google: null, pendingInputs: 0, brandFactCount: 0 }
afterEach(() => { cleanup(); document.body.replaceChildren() })

it("keeps a closed sheet inert without moving focus, then traps and restores focus when opened", () => {
  const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus()
  const props = { locale: "en" as const, summary, onClose: vi.fn(), newActionHref: "/en/tasks/new" }
  const view = render(<StudioContextPanel {...props} open={false} />)
  expect(view.container.querySelector("aside")).toHaveAttribute("inert")
  expect(trigger).toHaveFocus()
  view.rerender(<StudioContextPanel {...props} open />)
  const dialog = screen.getByRole("dialog")
  const close = screen.getByRole("button", { name: "Hide context" })
  expect(dialog).toHaveAttribute("aria-modal", "true")
  expect(close).toHaveFocus()
  expect(trigger).toHaveAttribute("inert")
  const link = screen.getByRole("link")
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true })
  expect(link).toHaveFocus()
  fireEvent.keyDown(link, { key: "Tab" })
  expect(close).toHaveFocus()
  fireEvent.keyDown(close, { key: "Escape" })
  expect(props.onClose).toHaveBeenCalledOnce()
  view.rerender(<StudioContextPanel {...props} open={false} />)
  expect(trigger).not.toHaveAttribute("inert")
  expect(trigger).toHaveFocus()
})

it.each([false, true])("respects background inert changes while a sheet is open (initially %s)", async initiallyInert => {
  const panels = (backgroundInert: boolean, open: boolean) => <>
    <aside data-testid="responsive-rail" inert={backgroundInert}><button>Rail control</button></aside>
    <StudioContextPanel locale="en" summary={summary} open={open} onClose={vi.fn()} />
  </>
  const view = render(panels(initiallyInert, true))
  const background = screen.getByTestId("responsive-rail")
  view.rerender(panels(!initiallyInert, true))
  await act(async () => { await Promise.resolve() })
  expect(background).toHaveAttribute("inert")
  view.rerender(panels(!initiallyInert, false))
  expect(background.hasAttribute("inert")).toBe(!initiallyInert)
})

it("does not refocus on summary/callback updates and preserves pre-existing background inertness", () => {
  const background = document.createElement("div"); background.setAttribute("inert", ""); document.body.append(background)
  const view = render(<StudioContextPanel locale="en" summary={summary} open onClose={vi.fn()} newActionHref="/en/tasks/new" />)
  const link = screen.getByRole("link"); link.focus()
  const onClose = vi.fn()
  view.rerender(<StudioContextPanel locale="en" summary={{ ...summary, pendingInputs: 2 }} open onClose={onClose} newActionHref="/en/tasks/new" />)
  expect(link).toHaveFocus()
  fireEvent.keyDown(link, { key: "Escape" })
  expect(onClose).toHaveBeenCalledOnce()
  view.unmount()
  expect(background).toHaveAttribute("inert")
})
