// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { StudioConversation } from "@/lib/studio/types"
import { StudioConversationRail } from "./conversation-rail"

const conversation: StudioConversation = { id: "chat", title: "First chat", status: "active", locationId: null, createdAt: "2026-11-13T00:00:00Z", updatedAt: "2026-11-13T00:00:00Z", lastMessageAt: "2026-11-13T00:00:00Z", accessRole: "owner", shared: false }
const props = () => ({ locale: "en" as const, conversations: [conversation], activeId: "chat", disabled: false, open: true, onClose: vi.fn(), onSelect: vi.fn(), onNew: vi.fn(), onArchive: vi.fn(), onRename: vi.fn(async () => true) })
function viewport(narrow: boolean) {
  const listeners = new Set<() => void>()
  const query = { matches: narrow, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) }
  vi.stubGlobal("matchMedia", vi.fn(() => query))
  return (value: boolean) => act(() => { query.matches = value; listeners.forEach((listener) => listener()) })
}
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.unstubAllGlobals() })

it("uses modal semantics on tablet/mobile and releases isolation when resized to desktop", () => {
  const resize = viewport(true)
  const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus()
  render(<StudioConversationRail {...props()} />)
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true")
  expect(trigger).toHaveAttribute("inert")
  resize(false)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(trigger).not.toHaveAttribute("inert")
  trigger.remove()
})

it("consumes rename Escape without closing the drawer and restores row focus on cancel and save", async () => {
  viewport(true)
  const options = props()
  render(<StudioConversationRail {...options} />)
  fireEvent.click(screen.getByRole("button", { name: "Rename: First chat" }))
  const input = screen.getByRole("textbox", { name: "Rename" })
  const escaped = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  fireEvent(input, escaped)
  expect(escaped.defaultPrevented).toBe(true)
  expect(options.onClose).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: "First chat" })).toHaveFocus()
  fireEvent.click(screen.getByRole("button", { name: "Rename: First chat" }))
  fireEvent.change(screen.getByRole("textbox", { name: "Rename" }), { target: { value: "Renamed" } })
  fireEvent.submit(screen.getByRole("textbox", { name: "Rename" }).closest("form")!)
  await waitFor(() => expect(screen.getByRole("button", { name: "First chat" })).toHaveFocus())
  expect(options.onRename).toHaveBeenCalledWith("chat", "Renamed")
})

it("keeps the desktop rail nonmodal and does not change focus when open changes", () => {
  viewport(false)
  const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus()
  const options = props()
  const view = render(<StudioConversationRail {...options} open={false} />)
  view.rerender(<StudioConversationRail {...options} open />)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(trigger).not.toHaveAttribute("inert")
  expect(trigger).toHaveFocus()
})

it("returns focus on drawer dismissal and consumes Escape on rename buttons", () => {
  viewport(true)
  const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus()
  const options = props()
  const view = render(<StudioConversationRail {...options} />)
  fireEvent.click(screen.getByRole("button", { name: "Rename: First chat" }))
  fireEvent.keyDown(screen.getByRole("button", { name: "Rename" }), { key: "Escape" })
  expect(options.onClose).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: "First chat" })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole("button", { name: "First chat" }), { key: "Escape" })
  expect(options.onClose).toHaveBeenCalledOnce()
  view.rerender(<StudioConversationRail {...options} open={false} />)
  expect(trigger).toHaveFocus()
})

it.each(["select", "new"])("does not steal intended composer focus after %s", (operation) => {
  viewport(true)
  const composer = document.createElement("textarea"); document.body.append(composer)
  const options = props()
  const view = render(<StudioConversationRail {...options} onSelect={() => composer.focus()} onNew={() => composer.focus()} />)
  const target = operation === "select" ? screen.getByRole("button", { name: "First chat" }) : screen.getByRole("button", { name: /new/i })
  fireEvent.click(target)
  expect(composer).toHaveFocus()
  view.unmount()
  expect(composer).toHaveFocus()
  composer.remove()
})
