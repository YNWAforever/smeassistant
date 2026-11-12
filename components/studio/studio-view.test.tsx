// @vitest-environment jsdom
import { act } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/owner/kam-man-house/studio",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

import { StudioView, type StudioViewProps } from "@/components/studio/studio-view"
import { studioText } from "@/lib/studio/copy"
import type {
  StudioContextSummary,
  StudioConversation,
  StudioMessage,
  StudioPromptChip,
  StudioStreamEvent,
} from "@/lib/studio/types"

const t = studioText("en")
const WORKSPACE_ID = "ws-1"
const WORKSPACE_SLUG = "kam-man-house"
const ACTION_ID = "11111111-2222-4333-8444-555555555555"
const VERSION_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa"

const encoder = new TextEncoder()

const conversationA: StudioConversation = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  title: "What should I do first?",
  status: "active",
  locationId: null,
  createdAt: "2026-11-08T09:00:00.000Z",
  updatedAt: "2026-11-08T10:00:00.000Z",
  lastMessageAt: "2026-11-08T10:00:00.000Z", accessRole: "owner", shared: false,
}

const conversationB: StudioConversation = {
  id: "bbbbbbbb-2222-4222-8222-222222222222",
  title: "What changed since the last scan?",
  status: "active",
  locationId: null,
  createdAt: "2026-11-07T09:00:00.000Z",
  updatedAt: "2026-11-07T10:00:00.000Z",
  lastMessageAt: "2026-11-07T10:00:00.000Z", accessRole: "owner", shared: false,
}

function userMessage(seq: number, content: string, conversation = conversationA): StudioMessage {
  return {
    id: `user-${seq}`,
    conversationId: conversation.id,
    seq,
    role: "user",
    content,
    parts: [{ kind: "text", text: content }],
    intent: null,
    createdAt: "2026-11-08T10:00:00.000Z",
  }
}

function assistantMessage(seq: number, messageText: string, extraParts: StudioMessage["parts"] = [], conversation = conversationA): StudioMessage {
  return {
    id: `assistant-${seq}`,
    conversationId: conversation.id,
    seq,
    role: "assistant",
    content: messageText,
    parts: [{ kind: "text", text: messageText }, ...extraParts],
    intent: null,
    createdAt: "2026-11-08T10:00:01.000Z",
  }
}

const evidencePart: StudioMessage["parts"][number] = {
  kind: "evidence",
  refs: [
    {
      evidenceId: "ev:1",
      scanId: "scan-1",
      factType: "Observed",
      label: "Unanswered reviews",
      value: "1 review unanswered",
      observedAt: "2026-10-17T00:00:00.000Z",
      source: "Google Business Profile",
    },
  ],
}

const artifactPart: StudioMessage["parts"][number] = {
  kind: "artifact",
  actionId: ACTION_ID,
  actionTitle: "Reply to the waiting review",
  artifactType: "review_reply",
  title: "Review reply draft",
  body: "Thank you for your review. We appreciate your feedback.",
  acceptanceCriteria: ["Uses the confirmed brand voice"],
  draftRunId: "run-1",
  requiresApproval: true,
}

function contextSummary(overrides: Partial<StudioContextSummary> = {}): StudioContextSummary {
  return {
    locationName: "Yik Yam",
    latestScan: { score: "78", coverage: "86%", observedAt: "2026-11-01T00:00:00.000Z", observedLabel: "1 Nov 2026" },
    openActions: [{ id: ACTION_ID, title: "Reply to the waiting review", priority: "High", state: "Open" }],
    waitingVersions: 1,
    google: "Connected",
    pendingInputs: 0,
    brandFactCount: 3,
    ...overrides,
  }
}

const chips: StudioPromptChip[] = [
  { id: "starter_priorities", label: "What should I do first?", message: "What should I do first, and why?" },
  { id: "starter_changed", label: "What changed?", message: "What changed since the last comparable scan?" },
]

function baseProps(overrides: Partial<StudioViewProps> = {}): StudioViewProps {
  return {
    locale: "en",
    workspaceId: WORKSPACE_ID,
    workspaceName: "Kam Man House",
    workspaceSlug: WORKSPACE_SLUG,
    userId: "user-1",
    role: "owner",
    locationSlug: "all",
    locations: [{ id: "loc-1", slug: "yik-yam", name: "Yik Yam" }],
    conversations: [],
    activeConversationId: null,
    initialMessages: [],
    initialHasMore: false,
    contextSummary: contextSummary(),
    chips,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function sseResponse(frames: ReadonlyArray<StudioStreamEvent | string>): Response {
  const chunks = frames.map((frame) => encoder.encode(`data: ${typeof frame === "string" ? frame : JSON.stringify(frame)}\n\n`))
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } })
}

/** A stream the test drives frame by frame; aborting the request errors it, like a real socket. */
function controlledSse() {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(next) {
      controller = next
    },
  })
  return {
    response: new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } }),
    push(frame: StudioStreamEvent | string) {
      controller?.enqueue(encoder.encode(`data: ${typeof frame === "string" ? frame : JSON.stringify(frame)}\n\n`))
    },
    failAbort() {
      controller?.error(new DOMException("Aborted", "AbortError"))
    },
  }
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(handler: Handler) {
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init ?? {})))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function messagesPostCall() {
  const call = fetchMock.mock.calls.find(([url, init]) => String(url).includes("/messages") && (init as RequestInit | undefined)?.method === "POST")
  expect(call).toBeDefined()
  return {
    url: String(call![0]),
    body: JSON.parse(String((call![1] as RequestInit).body)) as Record<string, unknown>,
    init: call![1] as RequestInit,
  }
}

function composer() {
  return screen.getByLabelText(t.composer.label) as HTMLTextAreaElement
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  window.history.replaceState(null, "", "/")
})

describe("StudioView ??empty state and first conversation", () => {
  it("shows a genuine question with starters and the authority boundary", () => {
    installFetch(() => jsonResponse({ conversations: [] }))
    render(<StudioView {...baseProps()} />)
    expect(screen.getByRole("heading", { name: t.empty.title })).toBeInTheDocument()
    expect(screen.getByText(t.empty.body)).toBeInTheDocument()
    expect(screen.getByText(t.empty.boundary)).toBeInTheDocument()
    for (const chip of chips) expect(screen.getByRole("button", { name: chip.label })).toBeInTheDocument()
    // No approve / export / publish control exists anywhere on the surface.
    for (const pattern of [/approve/i, /export/i, /publish/i]) {
      expect(screen.queryByRole("button", { name: pattern })).toBeNull()
      expect(screen.queryByRole("link", { name: pattern })).toBeNull()
    }
  })

  it("links owners to the existing action creation page from the context panel", () => {
  render(<StudioView {...baseProps({ locationSlug: "primary" })} />)
  expect(screen.getByRole("link", { name: t.context.newAction })).toHaveAttribute(
    "href",
    "/en/owner/kam-man-house/actions/new?location=primary",
  )
})

it("links each open action in the context panel to its detail page", () => {
  render(<StudioView {...baseProps({ locationSlug: "primary" })} />)
  expect(screen.getByRole("link", { name: "Reply to the waiting review" })).toHaveAttribute(
    "href",
    `/en/owner/kam-man-house/actions/${ACTION_ID}?location=primary`,
  )
})

it("offers an IG planning starter that asks for missing facts instead of inventing them", () => {
  render(<StudioView {...baseProps({ chips: t.empty.starters })} />)
  const starter = t.empty.starters.find((chip) => chip.id === "starter_ig")
  expect(starter).toBeDefined()
  expect(screen.getByRole("button", { name: starter!.label })).toBeInTheDocument()
  expect(starter!.message).toContain("instead of inventing")
})

it("creates a conversation lazily on the first starter and streams the answer", async () => {
    const assistant = assistantMessage(2, "Start with the unanswered reviews.", [evidencePart])
    installFetch((url, init) => {
      if (url === "/api/studio/conversations" && init.method === "POST") return jsonResponse({ conversation: { ...conversationA, title: "" } }, 201)
      if (url.includes("/messages") && init.method === "POST") {
        return sseResponse([
          { type: "status", stage: "reading" },
          { type: "user", message: userMessage(1, "What should I do first, and why?") },
          { type: "status", stage: "thinking" },
          { type: "message", message: assistant, conversation: conversationA },
          { type: "done" },
        ])
      }
      if (init.method === "GET") return jsonResponse({ conversation: conversationA, messages: [assistant], hasMore: false })
      return jsonResponse({ error: "unavailable" }, 500)
    })
    render(<StudioView {...baseProps()} />)
    fireEvent.click(screen.getByRole("button", { name: chips[0]!.label }))
    await waitFor(() => expect(screen.getByText("Start with the unanswered reviews.")).toBeInTheDocument())
    const posted = messagesPostCall()
    expect(posted.body).toEqual({ workspaceId: WORKSPACE_ID, text: chips[0]!.message })
    // The server-authorised evidence is rendered next to the answer.
    expect(screen.getByText("Google Business Profile")).toBeInTheDocument()
    expect(screen.getByText("17 Oct 2026")).toBeInTheDocument()
    // The new conversation is in the rail and the URL names it.
    expect(screen.getByRole("button", { name: conversationA.title })).toBeInTheDocument()
    expect(window.location.search).toContain(`chat=${conversationA.id}`)
  })
})

describe("StudioView ??rail and continuity", () => {
  it("loads the selected conversation, keeps the old one in the rail and syncs ?chat=", async () => {
    const older = userMessage(1, "What changed since the last scan?", conversationB)
    installFetch((url, init) => {
      if (init.method === "GET" && url.startsWith(`/api/studio/conversations/${conversationB.id}`)) {
        return jsonResponse({ conversation: conversationB, messages: [older], hasMore: false })
      }
      return jsonResponse({ error: "unavailable" }, 500)
    })
    render(<StudioView {...baseProps({
      conversations: [conversationA, conversationB],
      activeConversationId: conversationA.id,
      initialMessages: [assistantMessage(1, "First answer.")],
    })} />)
    fireEvent.click(screen.getByRole("button", { name: conversationB.title }))
    await waitFor(() => expect(screen.getByText("What changed since the last scan?")).toBeInTheDocument())
    expect(screen.queryByText("First answer.")).not.toBeInTheDocument()
    expect(window.location.search).toContain(`chat=${conversationB.id}`)
    expect(screen.getByRole("button", { name: conversationA.title })).toBeInTheDocument()
  })

  it("renders the streaming stages, the optimistic turn and then the persisted answer", async () => {
    const stream = controlledSse()
    installFetch((url) => {
      if (url.includes("/messages")) return stream.response
      return jsonResponse({ error: "unavailable" }, 500)
    })
    render(<StudioView {...baseProps({ conversations: [conversationA], activeConversationId: conversationA.id })} />)
    fireEvent.change(composer(), { target: { value: "What should I do first?" } })
    fireEvent.click(screen.getByRole("button", { name: t.composer.send }))
    await waitFor(() => expect(screen.getByText(t.status.reading)).toBeInTheDocument())
    // Optimistic: the owner's words are already in the thread, the composer cleared.
    expect(within(screen.getByRole("log")).getByText("What should I do first?")).toBeInTheDocument()
    expect(composer().value).toBe("")
    await act(async () => stream.push({ type: "status", stage: "thinking" }))
    await waitFor(() => expect(screen.getByText(t.status.thinking)).toBeInTheDocument())
    await act(async () => stream.push({ type: "user", message: userMessage(1, "What should I do first?") }))
    await act(async () => stream.push({ type: "delta", text: "Start with " }))
    await waitFor(() => expect(screen.getByText(/Start with/)).toBeInTheDocument())
    const answer = assistantMessage(2, "Start with the unanswered reviews.")
    await act(async () => stream.push({ type: "message", message: answer, conversation: conversationA }))
    await act(async () => stream.push({ type: "done" }))
    await waitFor(() => expect(screen.getByText("Start with the unanswered reviews.")).toBeInTheDocument())
    expect(screen.queryByText(t.status.reading)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.composer.send })).toBeInTheDocument()
  })
})

describe("StudioView ??inline work", () => {
  it("renders the draft artifact, saves it as a version via the existing route and offers review, never approve/export", async () => {
    const artifactMessage = assistantMessage(2, "Here is a draft reply.", [evidencePart, artifactPart])
    const stream = controlledSse()
    installFetch((url, init) => {
      if (url.endsWith(`/api/actions/${ACTION_ID}/versions`) && init.method === "POST") {
        return jsonResponse({ versionId: VERSION_ID, versionNo: 1 }, 201)
      }
      if (url.includes("/messages")) return stream.response
      return jsonResponse({ error: "unavailable" }, 500)
    })
    render(<StudioView {...baseProps({ conversations: [conversationA], activeConversationId: conversationA.id })} />)
    fireEvent.change(composer(), { target: { value: "Draft a review reply" } })
    fireEvent.click(screen.getByRole("button", { name: t.composer.send }))
    await waitFor(() => expect(screen.getByRole("button", { name: t.composer.stop })).toBeInTheDocument())
    await act(async () => stream.push({ type: "user", message: userMessage(1, "Draft a review reply") }))
    await act(async () => stream.push({ type: "message", message: artifactMessage, conversation: conversationA }))
    await act(async () => stream.push({ type: "done" }))
    await waitFor(() => expect(screen.getByText(t.message.artifactReady)).toBeInTheDocument())
    expect(screen.getByText("Review reply draft")).toBeInTheDocument()
    expect(screen.getByText("Thank you for your review. We appreciate your feedback.")).toBeInTheDocument()
    expect(screen.getByText("Uses the confirmed brand voice")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: t.message.saveVersion }))
    const save = await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(`/api/actions/${ACTION_ID}/versions`))
      expect(call).toBeDefined()
      return call!
    })
    expect(JSON.parse(String((save[1] as RequestInit).body))).toEqual({ assistant_run_id: "run-1" })
    const review = await screen.findByRole("link", { name: t.message.reviewVersion })
    expect(review.getAttribute("href")).toContain(`/actions/${ACTION_ID}?version=${VERSION_ID}`)
    expect(review.getAttribute("href")).toContain("from=studio")
    expect(screen.getByText(t.message.versionSaved)).toBeInTheDocument()

    for (const pattern of [/approve/i, /publish/i]) {
      expect(screen.queryByRole("button", { name: pattern })).toBeNull()
      expect(screen.queryByRole("link", { name: pattern })).toBeNull()
    }
    // The only export on the surface is the read-only transcript download.
    expect(screen.getByRole("button", { name: t.transcript.export })).toBeInTheDocument()
  })

  it("renders the Studio carousel outline next to the caption with the planning note", () => {
    const carouselPart = {
      ...artifactPart,
      carousel: [{ heading: "Slide one", detail: "Confirmed fact" }],
    } as StudioMessage["parts"][number]
    const carouselMessage = assistantMessage(1, "Draft ready.", [carouselPart])
    installFetch(() => jsonResponse({ error: "unavailable" }, 500))
    render(<StudioView {...baseProps({
      conversations: [conversationA],
      activeConversationId: conversationA.id,
      initialMessages: [carouselMessage],
    })} />)
    expect(screen.getByText(t.message.carousel)).toBeInTheDocument()
    expect(screen.getByText("Slide one")).toBeInTheDocument()
    expect(screen.getByText("Confirmed fact")).toBeInTheDocument()
    expect(screen.getByText(t.message.carouselPlanOnly)).toBeInTheDocument()
    expect(screen.getByText(artifactPart.kind === "artifact" ? artifactPart.body : "")).toBeInTheDocument()
  })

  it("gives a viewer the answer and the role boundary without a save control", () => {
    const artifactMessage = assistantMessage(1, "Here is a draft reply.", [artifactPart])
    installFetch(() => jsonResponse({ error: "unavailable" }, 500))
    render(<StudioView {...baseProps({
      role: "viewer",
      conversations: [conversationA],
      activeConversationId: conversationA.id,
      initialMessages: [artifactMessage],
    })} />)
    expect(screen.getAllByText(t.notices.viewer).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: t.message.saveVersion })).toBeNull()
    expect(screen.getByRole("link", { name: t.message.openAction })).toBeInTheDocument()
  })
})

describe("StudioView ??honest failures", () => {
  it("keeps the text, shows a localized banner and retries the same turn", async () => {
    const answer = assistantMessage(2, "Start with the unanswered reviews.")
    let messagePosts = 0
    installFetch((url) => {
      if (url.includes("/messages")) {
        messagePosts += 1
        if (messagePosts === 1) return jsonResponse({ error: "rate_limited" }, 429)
        return sseResponse([
          { type: "user", message: userMessage(1, "What should I do first?") },
          { type: "message", message: answer, conversation: conversationA },
          { type: "done" },
        ])
      }
      return jsonResponse({ error: "unavailable" }, 500)
    })
    render(<StudioView {...baseProps({ conversations: [conversationA], activeConversationId: conversationA.id })} />)
    fireEvent.change(composer(), { target: { value: "What should I do first?" } })
    fireEvent.click(screen.getByRole("button", { name: t.composer.send }))
    const banner = await screen.findByRole("alert")
    expect(banner).toHaveTextContent(t.errors.rate_limited)
    // Nothing was written, so the owner's text is handed back, not lost.
    expect(composer().value).toBe("What should I do first?")
    fireEvent.click(screen.getByRole("button", { name: t.message.retry }))
    await waitFor(() => expect(screen.getByText("Start with the unanswered reviews.")).toBeInTheDocument())
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("does not offer a retry button when another turn is still running", async () => {
    installFetch((url, init) => {
      if (url.includes("/messages") && init.method === "POST") return jsonResponse({ error: "conversation_busy" }, 409)
      if (init.method === "GET") return jsonResponse({ conversation: conversationA, messages: [], hasMore: false })
      return jsonResponse({ error: "unavailable" }, 500)
    })
    render(<StudioView {...baseProps({ conversations: [conversationA], activeConversationId: conversationA.id })} />)
    fireEvent.change(composer(), { target: { value: "Second question" } })
    fireEvent.click(screen.getByRole("button", { name: t.composer.send }))
    const banner = await screen.findByRole("alert")
    expect(banner).toHaveTextContent(t.errors.conversation_busy)
    expect(composer().value).toBe("Second question")
    expect(screen.queryByRole("button", { name: t.message.retry })).not.toBeInTheDocument()
  })

  it("stops a running turn without inventing an answer", async () => {
    const stream = controlledSse()
    let requestSignal: AbortSignal | null = null
    installFetch((url, init) => {
      if (url.includes("/messages")) {
        requestSignal = init.signal ?? null
        init.signal?.addEventListener("abort", () => stream.failAbort())
        return stream.response
      }
      if (init.method === "GET") return jsonResponse({ conversation: conversationA, messages: [], hasMore: false })
      return jsonResponse({ error: "unavailable" }, 500)
    })
    render(<StudioView {...baseProps({ conversations: [conversationA], activeConversationId: conversationA.id })} />)
    fireEvent.change(composer(), { target: { value: "What should I do first?" } })
    fireEvent.click(screen.getByRole("button", { name: t.composer.send }))
    await waitFor(() => expect(screen.getByRole("button", { name: t.composer.stop })).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: t.composer.stop }))
    await waitFor(() => expect(requestSignal?.aborted).toBe(true))
    await waitFor(() => expect(screen.getByRole("button", { name: t.composer.send })).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: t.composer.stop })).not.toBeInTheDocument()
    // Reconciliation proved the turn was not stored, so the text is back.
    await waitFor(() => expect(composer().value).toBe("What should I do first?"))
  })
})

describe("StudioView ??accessibility", () => {
  it("exposes the thread as a polite log and labels the composer", () => {
    installFetch(() => jsonResponse({ error: "unavailable" }, 500))
    render(<StudioView {...baseProps({ conversations: [conversationA], activeConversationId: conversationA.id, initialMessages: [assistantMessage(1, "Ready.")] })} />)
    const log = screen.getByRole("log")
    expect(log).toHaveAttribute("aria-live", "polite")
    expect(composer()).toHaveAttribute("aria-describedby", "studio-composer-hint")
    expect(screen.getByRole("navigation", { name: t.rail.listLabel })).toBeInTheDocument()
  })
})
