import type { PrototypeLocale } from "@/lib/copy"

import {
  studioErrorCodes,
  studioMessageRoles,
  studioStreamStages,
  type StudioConversation,
  type StudioConversationDetailResponse,
  type StudioConversationListResponse,
  type StudioConversationMember,
  type StudioShareCandidate,
  type StudioConversationMembersResponse,
  type StudioConversationMemberRole,
  type StudioConversationStatus,
  type StudioErrorCode,
  type StudioMessage,
  type StudioMessagePart,
  type StudioRenameConversationRequest,
  type StudioSendMessageRequest,
  type StudioStreamEvent,
} from "@/lib/studio/types"

/**
 * Browser-side helpers for the Conversation Studio routes (design §8, §12).
 *
 * Mirrors lib/workspace/client.ts: every helper resolves to a discriminated
 * result and never throws, so a dropped connection, an offline browser or a
 * malformed body becomes a localized banner instead of an unhandled rejection
 * in the middle of a conversation.
 *
 * `streamStudioMessage` additionally owns the SSE reader. It only ever hands
 * the caller fully validated `StudioStreamEvent` objects: a frame that does not
 * match the wire contract is skipped rather than trusted, and the final
 * persisted `message` event remains the authority even when `delta` frames
 * arrived first. A pre-stream failure is a normal JSON error body with a code;
 * an aborted request resolves as `aborted` so the UI can stop quietly.
 */

export type StudioClientFailureCode = StudioErrorCode | "network" | "http_error" | "stream" | "aborted"

export type StudioClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: StudioClientFailureCode; error: string }

export type StudioStreamResult =
  | { ok: true }
  | { ok: false; status: number; code: StudioClientFailureCode; error: string }

const JSON_HEADERS = { "Content-Type": "application/json" }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** The route's `{ error: "<code>" }` names a known Studio code; anything else is `unavailable`. */
export function normaliseStudioErrorCode(value: unknown): StudioErrorCode {
  return typeof value === "string" && (studioErrorCodes as ReadonlyArray<string>).includes(value)
    ? (value as StudioErrorCode)
    : "unavailable"
}

export function isStudioErrorCode(value: unknown): value is StudioErrorCode {
  return typeof value === "string" && (studioErrorCodes as ReadonlyArray<string>).includes(value)
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && (error as { name?: unknown }).name === "AbortError"
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

function queryString(query: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ""
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function failureFromBody(status: number, body: unknown): StudioClientResult<never> {
  const error = isRecord(body) && typeof body.error === "string" ? body.error : status > 0 ? `http_${status}` : "network"
  return { ok: false, status, code: status === 0 ? "network" : normaliseStudioErrorCode(error), error }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: unknown
  signal?: AbortSignal
}

async function request<T>(url: string, options: RequestOptions = {}): Promise<StudioClientResult<T>> {
  if (isOffline()) return { ok: false, status: 0, code: "network", error: "offline" }
  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers: options.body === undefined ? undefined : JSON_HEADERS,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  } catch (error) {
    if (isAbortError(error)) return { ok: false, status: 0, code: "aborted", error: "aborted" }
    return { ok: false, status: 0, code: "network", error: "network" }
  }
  const body = await readJson(response)
  if (!response.ok) return failureFromBody(response.status, body)
  if (!isRecord(body)) return { ok: false, status: response.status, code: "unavailable", error: "invalid_response" }
  return { ok: true, data: body as T }
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/** `locationId` null/undefined lists every conversation the caller owns in the workspace. */
export async function listStudioConversations(
  workspaceId: string,
  locationId?: string | null,
): Promise<StudioClientResult<StudioConversation[]>> {
  const url = `/api/studio/conversations${queryString({ workspaceId, locationId })}`
  const result = await request<StudioConversationListResponse>(url)
  if (!result.ok) return result
  return { ok: true, data: Array.isArray(result.data.conversations) ? result.data.conversations.filter(isStudioConversation) : [] }
}

export async function createStudioConversation(
  workspaceId: string,
  locationId?: string | null,
  title?: string,
): Promise<StudioClientResult<StudioConversation>> {
  const body = { workspaceId, ...(locationId ? { locationId } : {}), ...(title ? { title } : {}) }
  const result = await request<{ conversation?: unknown }>("/api/studio/conversations", { method: "POST", body })
  if (!result.ok) return result
  const conversation = isRecord(result.data) ? result.data.conversation : null
  if (!isStudioConversation(conversation)) return { ok: false, status: 201, code: "unavailable", error: "invalid_response" }
  return { ok: true, data: conversation }
}

/**
 * Convergence bridge: promote a browser-local workbench thread into a
 * persistent Studio conversation. The local copy is untouched; the server
 * imports the notes as the conversation's opening user turns.
 */
export async function importStudioConversation(
  workspaceId: string,
  input: { locationId?: string | null; title: string; notes: string[]; documentVersionIds?: string[] },
): Promise<StudioClientResult<StudioConversation>> {
  const body = {
    workspaceId,
    ...(input.locationId ? { locationId: input.locationId } : {}),
    title: input.title,
    notes: input.notes,
    ...(input.documentVersionIds?.length ? { documentVersionIds: input.documentVersionIds.slice(0, 5) } : {}),
  }
  const result = await request<{ conversation?: unknown }>("/api/studio/conversations/import", { method: "POST", body })
  if (!result.ok) return result
  const conversation = isRecord(result.data) ? result.data.conversation : null
  if (!isStudioConversation(conversation)) return { ok: false, status: 201, code: "unavailable", error: "invalid_response" }
  return { ok: true, data: conversation }
}

/**
 * Bulk convergence bridge: promote several browser-local threads in one
 * request. The route is atomic, so either every thread becomes a conversation
 * or none does; the response is in the same order as the request.
 */
export async function importStudioConversationsBulk(
  workspaceId: string,
  input: {
    locationId?: string | null
    threads: Array<{ title: string; notes: string[]; documentVersionIds?: string[] }>
  },
): Promise<StudioClientResult<{ conversations: StudioConversation[]; messageCount: number }>> {
  const body = {
    workspaceId,
    ...(input.locationId ? { locationId: input.locationId } : {}),
    threads: input.threads.map((thread) => ({
      title: thread.title,
      notes: thread.notes,
      ...(thread.documentVersionIds?.length ? { documentVersionIds: thread.documentVersionIds.slice(0, 5) } : {}),
    })),
  }
  const result = await request<{ conversations?: unknown; messageCount?: unknown }>("/api/studio/conversations/import-bulk", { method: "POST", body })
  if (!result.ok) return result
  const conversations = isRecord(result.data) && Array.isArray(result.data.conversations)
    ? result.data.conversations.filter(isStudioConversation)
    : []
  if (conversations.length !== input.threads.length) return { ok: false, status: 201, code: "unavailable", error: "invalid_response" }
  return { ok: true, data: { conversations, messageCount: typeof result.data.messageCount === "number" ? result.data.messageCount : 0 } }
}

export async function listStudioConversationMembers(
  workspaceId: string,
  conversationId: string,
): Promise<StudioClientResult<StudioConversationMembersResponse>> {
  const result = await request<{ members?: unknown; candidates?: unknown; canManage?: unknown; accessRole?: unknown }>(
    `/api/studio/conversations/${encodeURIComponent(conversationId)}/members?workspaceId=${encodeURIComponent(workspaceId)}`,
  )
  if (!result.ok) return result
  const data = result.data
  if (!isRecord(data) || !Array.isArray(data.members) || !Array.isArray(data.candidates)) {
    return { ok: false, status: 200, code: "unavailable", error: "invalid_response" }
  }
  const members = data.members
    .filter((member): member is Record<string, unknown> => isRecord(member) && typeof member.user_id === "string" && typeof member.user_email === "string")
    .map((member) => ({
      conversationId: typeof member.conversation_id === "string" ? member.conversation_id : "",
      userId: member.user_id as string,
      role: member.role === "viewer" ? "viewer" as const : "editor" as const,
      email: member.user_email as string,
      addedBy: typeof member.added_by === "string" ? member.added_by : null,
      createdAt: typeof member.created_at === "string" ? member.created_at : "",
    }))
  return {
    ok: true,
    data: {
      members,
      candidates: data.candidates.filter((candidate): candidate is StudioShareCandidate => (
        isRecord(candidate) && typeof candidate.userId === "string" && typeof candidate.email === "string"
      )),
      canManage: data.canManage === true,
      accessRole: data.accessRole === "editor" || data.accessRole === "viewer" ? data.accessRole : "owner",
    },
  }
}

export async function addStudioConversationMember(
  workspaceId: string,
  conversationId: string,
  userId: string,
  role: StudioConversationMemberRole,
): Promise<StudioClientResult<StudioConversationMember>> {
  const result = await request<{ member?: unknown }>(
    `/api/studio/conversations/${encodeURIComponent(conversationId)}/members`,
    { method: "POST", body: { workspaceId, userId, role } },
  )
  if (!result.ok) return result
  const member = isRecord(result.data) ? result.data.member : null
  if (!isRecord(member) || typeof member.user_id !== "string") {
    return { ok: false, status: 201, code: "unavailable", error: "invalid_response" }
  }
  return {
    ok: true,
    data: {
      conversationId: typeof member.conversation_id === "string" ? member.conversation_id : conversationId,
      userId: member.user_id,
      role: member.role === "viewer" ? "viewer" : "editor",
      email: typeof member.user_email === "string" ? member.user_email : "",
      addedBy: typeof member.added_by === "string" ? member.added_by : null,
      createdAt: typeof member.created_at === "string" ? member.created_at : "",
    },
  }
}

export async function removeStudioConversationMember(
  workspaceId: string,
  conversationId: string,
  userId: string,
): Promise<StudioClientResult<{ removed: true }>> {
  const result = await request<{ removed?: unknown }>(
    `/api/studio/conversations/${encodeURIComponent(conversationId)}/members?workspaceId=${encodeURIComponent(workspaceId)}&userId=${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  )
  if (!result.ok) return result
  return { ok: true, data: { removed: true } }
}

/**
 * Read-only transcript download (P3). Fetches the Markdown attachment and hands
 * it to the browser as a file; nothing is persisted client-side beyond the
 * transient object URL.
 */
export async function downloadStudioTranscript(
  workspaceId: string,
  conversationId: string,
  locale: PrototypeLocale,
): Promise<StudioClientResult<{ filename: string }>> {
  if (isOffline()) return { ok: false, status: 0, code: "network", error: "offline" }
  let response: Response
  try {
    response = await fetch(
      `/api/studio/conversations/${encodeURIComponent(conversationId)}/transcript?workspaceId=${encodeURIComponent(workspaceId)}&locale=${encodeURIComponent(locale)}`,
      { credentials: "same-origin" },
    )
  } catch {
    return { ok: false, status: 0, code: "network", error: "network" }
  }
  if (!response.ok) {
    const failure = failureFromBody(response.status, await readJson(response))
    return failure
  }
  const markdown = await response.text()
  const filename = `studio-${conversationId}.md`
  if (typeof document !== "undefined" && typeof URL.createObjectURL === "function") {
    const objectUrl = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }))
    try {
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = filename
      anchor.rel = "noopener"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }
  return { ok: true, data: { filename } }
}

export async function readStudioConversation(
  workspaceId: string,
  conversationId: string,
  options: { beforeSeq?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<StudioClientResult<StudioConversationDetailResponse>> {
  const url = `/api/studio/conversations/${encodeURIComponent(conversationId)}${queryString({
    workspaceId,
    beforeSeq: options.beforeSeq,
    limit: options.limit,
  })}`
  const result = await request<unknown>(url, options.signal ? { signal: options.signal } : {})
  if (!result.ok) return result
  const detail = result.data
  if (!isRecord(detail) || !isStudioConversation(detail.conversation) || !Array.isArray(detail.messages)) {
    return { ok: false, status: 200, code: "unavailable", error: "invalid_response" }
  }
  return {
    ok: true,
    data: {
      conversation: detail.conversation,
      messages: detail.messages.filter(isStudioMessage).sort((a, b) => a.seq - b.seq),
      hasMore: detail.hasMore === true,
    },
  }
}

export async function renameStudioConversation(
  workspaceId: string,
  conversationId: string,
  title: string,
): Promise<StudioClientResult<StudioConversation>> {
  return patchStudioConversation(workspaceId, conversationId, { title })
}

export async function archiveStudioConversation(
  workspaceId: string,
  conversationId: string,
): Promise<StudioClientResult<StudioConversation>> {
  return patchStudioConversation(workspaceId, conversationId, { status: "archived" })
}

export async function patchStudioConversation(
  workspaceId: string,
  conversationId: string,
  patch: StudioRenameConversationRequest,
): Promise<StudioClientResult<StudioConversation>> {
  const url = `/api/studio/conversations/${encodeURIComponent(conversationId)}${queryString({ workspaceId })}`
  const result = await request<{ conversation?: unknown }>(url, { method: "PATCH", body: { workspaceId, ...patch } })
  if (!result.ok) return result
  const conversation = isRecord(result.data) ? result.data.conversation : null
  if (!isStudioConversation(conversation)) return { ok: false, status: 200, code: "unavailable", error: "invalid_response" }
  return { ok: true, data: conversation }
}

// ---------------------------------------------------------------------------
// Streamed turn
// ---------------------------------------------------------------------------

const KNOWN_PART_KINDS = new Set(["text", "evidence", "artifact", "next_step", "warning"])

/** Keeps an unknown future part kind from breaking the thread; the renderer ignores what it cannot show. */
export function isKnownStudioPart(value: unknown): value is StudioMessagePart {
  return isRecord(value) && typeof value.kind === "string" && KNOWN_PART_KINDS.has(value.kind)
}

function isStudioConversation(value: unknown): value is StudioConversation {
  if (!isRecord(value)) return false
  const status = value.status
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (status === "active" || status === "archived") &&
    (value.locationId === null || typeof value.locationId === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.lastMessageAt === "string"
  )
}

function isStudioMessage(value: unknown): value is StudioMessage {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.conversationId === "string" &&
    typeof value.seq === "number" &&
    Number.isFinite(value.seq) &&
    (studioMessageRoles as ReadonlyArray<unknown>).includes(value.role) &&
    typeof value.content === "string" &&
    Array.isArray(value.parts) &&
    value.parts.every(isKnownStudioPart) &&
    (value.intent === null || typeof value.intent === "string") &&
    typeof value.createdAt === "string"
  )
}

/**
 * Validates one SSE `data:` payload against the shared wire contract. Exported
 * so the component tests can prove that a malformed frame is rejected without
 * a live server.
 */
export function parseStudioStreamEvent(raw: string): StudioStreamEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  switch (parsed.type) {
    case "status":
      return (studioStreamStages as ReadonlyArray<unknown>).includes(parsed.stage) ? { type: "status", stage: parsed.stage as StudioStreamEvent extends { type: "status"; stage: infer S } ? S : never } : null
    case "user":
      return isStudioMessage(parsed.message) ? { type: "user", message: parsed.message } : null
    case "delta":
      return typeof parsed.text === "string" ? { type: "delta", text: parsed.text } : null
    case "message":
      return isStudioMessage(parsed.message) && isStudioConversation(parsed.conversation)
        ? { type: "message", message: parsed.message, conversation: parsed.conversation }
        : null
    case "error":
      return typeof parsed.message === "string" && typeof parsed.retryable === "boolean"
        ? { type: "error", code: normaliseStudioErrorCode(parsed.code), message: parsed.message, retryable: parsed.retryable }
        : null
    case "done":
      return { type: "done" }
    default:
      return null
  }
}

type SseOutcome =
  | { kind: "done" }
  | { kind: "ended" }
  | { kind: "error"; code: StudioErrorCode; message: string }

async function consumeStudioSse(
  stream: ReadableStream<Uint8Array>,
  onEvent?: (event: StudioStreamEvent) => void,
): Promise<SseOutcome> {
  const reader = stream.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let sawDone = false

  const dispatch = (frame: string): SseOutcome | null => {
    const dataLines = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
    if (dataLines.length === 0) return null
    const event = parseStudioStreamEvent(dataLines.join("\n"))
    if (!event) return null
    onEvent?.(event)
    if (event.type === "done") {
      sawDone = true
      return { kind: "done" }
    }
    if (event.type === "error") return { kind: "error", code: event.code, message: event.message }
    return null
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, "\n")
      let boundary = buffer.indexOf("\n\n")
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const outcome = dispatch(frame)
        if (outcome) return outcome
        boundary = buffer.indexOf("\n\n")
      }
    }
    buffer += decoder.decode()
    buffer = buffer.replace(/\r\n/g, "\n")
    for (const frame of buffer.split("\n\n")) {
      if (!frame.trim()) continue
      const outcome = dispatch(frame)
      if (outcome) return outcome
    }
    return sawDone ? { kind: "done" } : { kind: "ended" }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Sends one owner turn and consumes the `StudioStreamEvent` stream. The caller
 * receives events in order and may abort with its own `AbortController`; an
 * abort resolves `{ ok: false, code: "aborted" }` rather than throwing.
 *
 * `locale` is passed as `?locale=` because the SSE route has no path locale and
 * would otherwise default the streamed notices to zh-HK.
 */
export async function streamStudioMessage(
  workspaceId: string,
  conversationId: string,
  body: StudioSendMessageRequest,
  handlers: { signal?: AbortSignal; onEvent?: (event: StudioStreamEvent) => void; locale?: PrototypeLocale } = {},
): Promise<StudioStreamResult> {
  if (isOffline()) return { ok: false, status: 0, code: "network", error: "offline" }
  let response: Response
  try {
    response = await fetch(`/api/studio/conversations/${encodeURIComponent(conversationId)}/messages${queryString({ locale: handlers.locale })}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { ...JSON_HEADERS, Accept: "text/event-stream" },
      // The route re-authorizes the workspace and the location on every turn;
      // neither id is trusted from the client, they are only scope inputs.
      body: JSON.stringify({
        workspaceId,
        text: body.text,
        ...(body.locationId ? { locationId: body.locationId } : {}),
        ...(body.documentVersionIds?.length ? { documentVersionIds: body.documentVersionIds } : {}),
        ...(body.searchBriefIds?.length ? { searchBriefIds: body.searchBriefIds } : {}),
      }),
      ...(handlers.signal ? { signal: handlers.signal } : {}),
    })
  } catch (error) {
    if (isAbortError(error)) return { ok: false, status: 0, code: "aborted", error: "aborted" }
    return { ok: false, status: 0, code: "network", error: "network" }
  }

  const contentType = response.headers.get("content-type") ?? ""
  // A pre-stream refusal is a normal JSON error, not a stream: read it and stop.
  if (!contentType.includes("text/event-stream")) {
    const failure = failureFromBody(response.status, await readJson(response))
    return failure
  }
  if (!response.body) return { ok: false, status: response.status, code: "stream", error: "stream_unavailable" }

  try {
    const outcome = await consumeStudioSse(response.body, handlers.onEvent)
    if (outcome.kind === "done") return { ok: true }
    if (outcome.kind === "error") return { ok: false, status: response.status, code: outcome.code, error: outcome.message }
    return { ok: false, status: response.status, code: "stream", error: "stream_ended" }
  } catch (error) {
    if (isAbortError(error) || handlers.signal?.aborted) return { ok: false, status: 0, code: "aborted", error: "aborted" }
    return { ok: false, status: 0, code: "stream", error: "stream_failed" }
  }
}

// ---------------------------------------------------------------------------
// Optimistic rendering helpers
// ---------------------------------------------------------------------------

let localMessageCounter = 0

/**
 * The user's message before the server answers. The thread shows it at once so
 * the conversation feels continuous; the authoritative `user` event replaces it
 * (same text, real id and seq) as soon as the turn is accepted.
 */
export function createLocalUserMessage(conversationId: string, content: string, seq: number): StudioMessage {
  localMessageCounter += 1
  return {
    id: `local-user-${Date.now().toString(36)}-${localMessageCounter}`,
    conversationId,
    seq,
    role: "user",
    content,
    parts: [{ kind: "text", text: content }],
    intent: null,
    createdAt: new Date().toISOString(),
  }
}

/**
 * A conversation title derived from the first user message, matching what the
 * repository stores when the title is still empty. Used only for the optimistic
 * rail row; the server-derived title wins on the next event.
 */
export function conversationTitleFromMessage(text: string, limit = 80): string {
  const firstLine = text.trim().split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? ""
  if (!firstLine) return ""
  const characters = Array.from(firstLine)
  return characters.length <= limit ? firstLine : `${characters.slice(0, Math.max(1, limit - 1)).join("")}…`
}

/** `true` once the stream announced a conversation-level busy/archived/rate-limit refusal. */
export function isRetryableStudioFailure(code: StudioClientFailureCode): boolean {
  return code === "network" || code === "stream" || code === "unavailable" || code === "ai_unavailable" || code === "conversation_busy" || code === "rate_limited"
}

export function isStudioConversationStatus(value: unknown): value is StudioConversationStatus {
  return value === "active" || value === "archived"
}
