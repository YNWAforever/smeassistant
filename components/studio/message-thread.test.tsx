// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ComponentProps } from "react"
import { StudioMessageThread } from "./message-thread"
import { studioText } from "@/lib/studio/copy"
import type { StudioMessage } from "@/lib/studio/types"

vi.mock("./message-bubble", () => ({ StudioMessageBubble: ({ message }: { message: StudioMessage }) => <p>{message.content}</p> }))
const t = studioText("en")
const message = (seq: number): StudioMessage => ({ id: `m-${seq}`, conversationId: "chat", seq, role: "user", content: `Message ${seq}`, parts: [], intent: null, createdAt: "2026-11-14T00:00:00Z" })
const base: ComponentProps<typeof StudioMessageThread> = { locale: "en", workspaceSlug: "shop", locationSlug: "all", conversationId: "chat", messages: [message(3), message(4), message(5)], optimisticUser: null, pending: null, streaming: false, hasMore: true, loadingEarlier: false, onLoadEarlier: vi.fn(), error: null, onRetry: vi.fn(), canSaveVersions: false }
const globalScroll = vi.fn()
function height(node: Element) { return 100 + (node.querySelector(".studio-streaming-text")?.textContent?.length ?? 0) }
function rows(node: Element) { return Array.from(node.querySelectorAll(".studio-messages > li")) }
function earlier(node: Element) { return node.querySelector(".studio-thread-earlier") ? 40 : 0 }
function rect(top: number, size: number): DOMRect { return { top, bottom: top + size, left: 0, right: 400, width: 400, height: size, x: 0, y: top, toJSON: () => ({}) } }
function scroll(node: HTMLElement, top: number) { node.scrollTop = top; fireEvent.scroll(node) }
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200)
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) { return earlier(this) + rows(this).reduce((sum, row) => sum + height(row), 0) })
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("studio-thread")) return rect(50, 200)
    const thread = this.closest<HTMLElement>(".studio-thread")
    if (!thread) return rect(0, 0)
    const preceding = rows(thread).slice(0, rows(thread).indexOf(this))
    return rect(50 + earlier(thread) + preceding.reduce((sum, row) => sum + height(row), 0) - thread.scrollTop, height(this))
  })
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })))
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: globalScroll })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); globalScroll.mockClear() })

describe("StudioMessageThread reading position", () => {
  it("preserves the visible message anchor when history is prepended and its button disappears", () => {
    const { rerender } = render(<StudioMessageThread {...base} />)
    const thread = screen.getByRole("log")
    scroll(thread, 80)
    const anchor = screen.getByText("Message 3").closest("li")!
    const before = anchor.getBoundingClientRect().top
    rerender(<StudioMessageThread {...base} messages={[message(1), message(2), ...base.messages]} hasMore={false} />)
    expect(thread.scrollTop).toBe(240)
    expect(anchor.getBoundingClientRect().top).toBe(before)
    expect(globalScroll).not.toHaveBeenCalled()
  })
  it("follows appended messages only while the reader is at the bottom", () => {
    const { rerender } = render(<StudioMessageThread {...base} />)
    const thread = screen.getByRole("log")
    expect(thread.scrollTop).toBe(140)
    scroll(thread, 60)
    const four = [...base.messages, message(6)]
    rerender(<StudioMessageThread {...base} messages={four} />)
    expect(thread.scrollTop).toBe(60)
    scroll(thread, 240)
    rerender(<StudioMessageThread {...base} messages={[...four, message(7)]} />)
    expect(thread.scrollTop).toBe(340)
    expect(globalScroll).not.toHaveBeenCalled()
  })
  it("follows token growth at the bottom but leaves a reader's earlier position alone", () => {
    const props = { ...base, streaming: true, pending: { stage: "thinking" as const, text: "Hello" } }
    const { rerender } = render(<StudioMessageThread {...props} />)
    const thread = screen.getByRole("log")
    expect(thread.scrollTop).toBe(245)
    rerender(<StudioMessageThread {...props} pending={{ stage: "thinking", text: "Hello world" }} />)
    expect(thread.scrollTop).toBe(251)
    scroll(thread, 90)
    rerender(<StudioMessageThread {...props} pending={{ stage: "thinking", text: "Hello world and more" }} />)
    expect(thread.scrollTop).toBe(90)
  })
  it("prioritizes the old reading anchor when history and a new turn arrive together", () => {
    const { rerender } = render(<StudioMessageThread {...base} />)
    const thread = screen.getByRole("log")
    const anchor = screen.getByText("Message 4").closest("li")!
    const before = anchor.getBoundingClientRect().top
    rerender(<StudioMessageThread {...base} messages={[message(1), message(2), ...base.messages, message(6)]} />)
    expect(thread.scrollTop).toBe(340)
    expect(anchor.getBoundingClientRect().top).toBe(before)
  })
  it("follows optimistic-to-saved replacement and resets position when changing conversations", () => {
    const { rerender } = render(<StudioMessageThread {...base} optimisticUser={message(6)} />)
    const thread = screen.getByRole("log")
    expect(thread.scrollTop).toBe(240)
    rerender(<StudioMessageThread {...base} messages={[...base.messages, message(6)]} streaming pending={{ stage: "thinking", text: "Hello" }} />)
    expect(thread.scrollTop).toBe(345)
    scroll(thread, 50)
    rerender(<StudioMessageThread {...base} conversationId="other-chat" />)
    expect(thread.scrollTop).toBe(140)
  })
  it("moves focus from a disappearing history button to the named log without scrolling the page", () => {
    const { rerender } = render(<StudioMessageThread {...base} />)
    const button = screen.getByRole("button", { name: t.thread.loadEarlier })
    button.focus()
    fireEvent.click(button)
    const thread = screen.getByRole("log")
    const focus = vi.spyOn(thread, "focus")
    rerender(<StudioMessageThread {...base} loadingEarlier />)
    expect(button).toBeDisabled()
    rerender(<StudioMessageThread {...base} hasMore={false} messages={[message(1), ...base.messages]} />)
    expect(thread).toHaveFocus()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })
  it("does not steal focus if the owner moved to another control while history loaded", () => {
    const view = (hasMore: boolean) => <><StudioMessageThread {...base} hasMore={hasMore} /><button>Composer control</button></>
    const { rerender } = render(view(true))
    screen.getByRole("button", { name: t.thread.loadEarlier }).focus()
    screen.getByRole("button", { name: "Composer control" }).focus()
    rerender(view(false))
    expect(screen.getByRole("button", { name: "Composer control" })).toHaveFocus()
  })
})

describe("StudioMessageThread announcements", () => {
  it("keeps one stable stage announcer outside the busy log and excludes token updates", () => {
    const { rerender } = render(<StudioMessageThread {...base} />)
    const status = screen.getByRole("status")
    const thread = screen.getByRole("log")
    expect(thread).not.toContainElement(status)
    expect(status).toBeEmptyDOMElement()
    rerender(<StudioMessageThread {...base} streaming pending={{ stage: "thinking", text: "Hello" }} />)
    expect(screen.getByRole("status")).toBe(status)
    expect(status).toHaveTextContent(t.status.thinking)
    expect(thread).toHaveAttribute("aria-busy", "true")
    expect(thread.querySelectorAll('[aria-live], [role="status"]')).toHaveLength(0)
    expect(thread.querySelector(".studio-pending")).toHaveAttribute("aria-hidden", "true")
    rerender(<StudioMessageThread {...base} streaming pending={{ stage: "thinking", text: "Hello world" }} />)
    expect(status).toHaveTextContent(t.status.thinking)
    expect(status).not.toHaveTextContent("Hello")
    expect(screen.getByText("Hello world")).toBeVisible()
    rerender(<StudioMessageThread {...base} messages={[...base.messages, message(6)]} />)
    expect(status).toBeEmptyDOMElement()
    expect(thread).not.toHaveAttribute("aria-busy")
    expect(screen.getByText("Message 6")).toBeVisible()
  })
  it.each(["en", "zh-HK", "zh-TW"] as const)("announces localized stage changes in %s", (locale) => {
    const { rerender } = render(<StudioMessageThread {...base} locale={locale} streaming pending={{ stage: "reading", text: "" }} />)
    const status = screen.getByRole("status")
    expect(status).toHaveTextContent(studioText(locale).status.reading)
    rerender(<StudioMessageThread {...base} locale={locale} streaming pending={{ stage: "thinking", text: "partial" }} />)
    expect(screen.getByRole("status")).toBe(status)
    expect(status).toHaveTextContent(studioText(locale).status.thinking)
  })
  it("preserves the lead's optional localized retry label", () => {
    render(<StudioMessageThread {...base} error={{ code: "network", message: "Disconnected", retryable: true, retryLabel: "Check saved reply" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Check saved reply" }))
    expect(base.onRetry).toHaveBeenCalled()
  })
})
