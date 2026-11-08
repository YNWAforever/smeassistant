import { afterEach, describe, expect, it, vi } from "vitest"

import {
  conversationTitleFromMessage,
  isRetryableStudioFailure,
  parseStudioStreamEvent,
  readStudioConversation,
  streamStudioMessage,
} from "./client"
import type { StudioConversation, StudioMessage, StudioStreamEvent } from "./types"

const encoder = new TextEncoder()

function sseResponse(frames: ReadonlyArray<StudioStreamEvent | string>): Response {
  const chunks = frames.map((frame) => encoder.encode(`data: ${typeof frame === "string" ? frame : JSON.stringify(frame)}\n\n`))
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  }), { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init ?? {})))
  vi.stubGlobal("fetch", mock)
  return mock
}

const conversation: StudioConversation = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Review replies",
  status: "active",
  locationId: null,
  createdAt: "2026-11-08T09:00:00.000Z",
  updatedAt: "2026-11-08T10:00:00.000Z",
  lastMessageAt: "2026-11-08T10:00:00.000Z", accessRole: "owner", shared: false,
}

const message: StudioMessage = {
  id: "22222222-2222-4222-8222-222222222222",
  conversationId: conversation.id,
  seq: 2,
  role: "assistant",
  content: "Start with the unanswered reviews.",
  parts: [{ kind: "text", text: "Start with the unanswered reviews." }],
  intent: null,
  createdAt: "2026-11-08T10:00:01.000Z",
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("parseStudioStreamEvent", () => {
  it("accepts every event the wire contract allows", () => {
    expect(parseStudioStreamEvent(JSON.stringify({ type: "status", stage: "drafting" }))).toEqual({ type: "status", stage: "drafting" })
    expect(parseStudioStreamEvent(JSON.stringify({ type: "user", message }))).toEqual({ type: "user", message })
    expect(parseStudioStreamEvent(JSON.stringify({ type: "delta", text: "Hm" }))).toEqual({ type: "delta", text: "Hm" })
    expect(parseStudioStreamEvent(JSON.stringify({ type: "message", message, conversation }))).toEqual({ type: "message", message, conversation })
    expect(parseStudioStreamEvent(JSON.stringify({ type: "error", code: "rate_limited", message: "slow down", retryable: true }))).toMatchObject({ code: "rate_limited", retryable: true })
    expect(parseStudioStreamEvent(JSON.stringify({ type: "done" }))).toEqual({ type: "done" })
  })

  it("drops malformed frames instead of trusting them", () => {
    expect(parseStudioStreamEvent("{not json")).toBeNull()
    expect(parseStudioStreamEvent(JSON.stringify({ type: "status", stage: "napping" }))).toBeNull()
    expect(parseStudioStreamEvent(JSON.stringify({ type: "delta", text: 42 }))).toBeNull()
    expect(parseStudioStreamEvent(JSON.stringify({ type: "message", message: { id: "x" }, conversation }))).toBeNull()
    expect(parseStudioStreamEvent(JSON.stringify({ type: "unknown" }))).toBeNull()
  })

  it("maps an unknown server error code to the generic unavailable code", () => {
    expect(parseStudioStreamEvent(JSON.stringify({ type: "error", code: "something_new", message: "x", retryable: false }))).toMatchObject({ code: "unavailable" })
  })
})

describe("streamStudioMessage", () => {
  it("posts the workspace turn and dispatches typed events in order", async () => {
    const seen: StudioStreamEvent[] = []
    const mock = stubFetch(() => sseResponse([
      { type: "status", stage: "reading" },
      { type: "user", message: { ...message, id: "user-1", seq: 1, role: "user", content: "Why first?" } },
      { type: "delta", text: "Start " },
      { type: "message", message, conversation },
      { type: "done" },
    ]))
    const result = await streamStudioMessage("ws-1", conversation.id, { text: "Why first?", locationId: "loc-1" }, { locale: "zh-HK", onEvent: (event) => seen.push(event) })
    expect(result).toEqual({ ok: true })
    expect(seen.map((event) => event.type)).toEqual(["status", "user", "delta", "message", "done"])
    const call = mock.mock.calls[0]!
    expect(String(call[0])).toContain(`/api/studio/conversations/${conversation.id}/messages?locale=zh-HK`)
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ workspaceId: "ws-1", text: "Why first?", locationId: "loc-1" })
  })

  it("skips a malformed data frame but keeps reading", async () => {
    stubFetch(() => sseResponse(["this is not json", { type: "done" } as StudioStreamEvent]))
    const seen: StudioStreamEvent[] = []
    const result = await streamStudioMessage("ws-1", conversation.id, { text: "Hi" }, { onEvent: (event) => seen.push(event) })
    expect(result).toEqual({ ok: true })
    expect(seen).toEqual([{ type: "done" }])
  })

  it("returns a pre-stream JSON error as a typed failure", async () => {
    stubFetch(() => jsonResponse({ error: "ai_paused" }, 503))
    const result = await streamStudioMessage("ws-1", conversation.id, { text: "Hi" })
    expect(result).toEqual({ ok: false, status: 503, code: "ai_paused", error: "ai_paused" })
  })

  it("returns a mid-stream error event as a failure", async () => {
    stubFetch(() => sseResponse([
      { type: "user", message: { ...message, id: "user-1", seq: 1, role: "user", content: "Hi" } },
      { type: "error", code: "unavailable", message: "boom", retryable: true },
      { type: "done" },
    ]))
    const result = await streamStudioMessage("ws-1", conversation.id, { text: "Hi" })
    expect(result).toMatchObject({ ok: false, code: "unavailable" })
  })

  it("reports a stream that ends before done", async () => {
    stubFetch(() => sseResponse([{ type: "delta", text: "half" }]))
    const result = await streamStudioMessage("ws-1", conversation.id, { text: "Hi" })
    expect(result).toEqual({ ok: false, status: 200, code: "stream", error: "stream_ended" })
  })

  it("resolves an aborted request instead of throwing", async () => {
    stubFetch(() => Promise.reject(new DOMException("Aborted", "AbortError")))
    const controller = new AbortController()
    controller.abort()
    const result = await streamStudioMessage("ws-1", conversation.id, { text: "Hi" }, { signal: controller.signal })
    expect(result).toEqual({ ok: false, status: 0, code: "aborted", error: "aborted" })
  })

  it("resolves a network failure instead of throwing", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")))
    const result = await streamStudioMessage("ws-1", conversation.id, { text: "Hi" })
    expect(result).toEqual({ ok: false, status: 0, code: "network", error: "network" })
  })
})

describe("readStudioConversation", () => {
  it("sorts messages by seq and reports invalid responses as a typed failure", async () => {
    stubFetch(() => jsonResponse({ conversation, messages: [{ ...message, seq: 4 }, { ...message, id: "b", seq: 3 }], hasMore: true }))
    const result = await readStudioConversation("ws-1", conversation.id)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.messages.map((entry) => entry.seq)).toEqual([3, 4])
      expect(result.data.hasMore).toBe(true)
    }
    stubFetch(() => jsonResponse({ nope: true }))
    expect(await readStudioConversation("ws-1", conversation.id)).toMatchObject({ ok: false, code: "unavailable" })
  })
})

describe("conversationTitleFromMessage", () => {
  it("uses the first non-empty line and truncates to the stored limit", () => {
    expect(conversationTitleFromMessage("\n\n  What changed?  \nmore")).toBe("What changed?")
    const long = conversationTitleFromMessage("x".repeat(100))
    expect(Array.from(long).length).toBe(80)
    expect(long.endsWith("…")).toBe(true)
    expect(conversationTitleFromMessage("   ")).toBe("")
  })
})

describe("isRetryableStudioFailure", () => {
  it("treats transport and provider-transient codes as retryable", () => {
    expect(isRetryableStudioFailure("network")).toBe(true)
    expect(isRetryableStudioFailure("conversation_busy")).toBe(true)
    expect(isRetryableStudioFailure("ai_unavailable")).toBe(true)
    expect(isRetryableStudioFailure("forbidden")).toBe(false)
    expect(isRetryableStudioFailure("not_found")).toBe(false)
  })
})
