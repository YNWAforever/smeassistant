"use client"

import { Download, Menu, PanelRight, Plus, Share2 } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import {
  archiveStudioConversation,
  conversationTitleFromMessage,
  createLocalUserMessage,
  createStudioConversation,
  downloadStudioTranscript,
  isRetryableStudioFailure,
  listStudioConversations,
  readStudioConversation,
  renameStudioConversation,
  streamStudioMessage,
} from "@/lib/studio/client"
import { studioText } from "@/lib/studio/copy"
import type {
  StudioCitationRef,
  StudioContextSummary,
  StudioConversation,
  StudioMessage,
  StudioPromptChip,
  StudioStreamStage,
} from "@/lib/studio/types"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"

import { StudioComposer } from "./composer"
import { StudioContextPanel } from "./context-panel"
import { StudioConversationRail } from "./conversation-rail"
import { StudioEmptyState } from "./empty-state"
import { StudioEvidencePicker } from "./evidence-picker"
import { StudioMessageThread, type StudioThreadError } from "./message-thread"
import { StudioShareDialog } from "./share-dialog"
import { studioBlockedText, studioErrorText } from "./studio-errors"

export type StudioViewProps = {
  locale: PrototypeLocale
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  role: WorkspaceRole
  locationSlug: string
  locations: Array<{ id: string; slug: string; name: string }>
  conversations: StudioConversation[]
  activeConversationId: string | null
  initialMessages: StudioMessage[]
  initialHasMore: boolean
  contextSummary: StudioContextSummary
  chips: StudioPromptChip[]
}

type AiBlocked = "ai_paused" | "ai_unavailable"

function mergeConversation(list: StudioConversation[], conversation: StudioConversation): StudioConversation[] {
  return list.some((entry) => entry.id === conversation.id)
    ? list.map((entry) => (entry.id === conversation.id ? conversation : entry))
    : [conversation, ...list]
}

function mergeMessage(list: StudioMessage[], message: StudioMessage): StudioMessage[] {
  const next = list.some((entry) => entry.id === message.id)
    ? list.map((entry) => (entry.id === message.id ? message : entry))
    : [...list, message]
  return next.slice().sort((a, b) => a.seq - b.seq)
}

/**
 * The breakpoint the CSS uses to turn the context pane into a drawer. Read
 * through `useSyncExternalStore` so the server renders the desktop-safe state
 * (pane pinned, drawer closed) and the browser corrects it after hydration
 * without a setState-inside-effect flash.
 */
const WIDE_QUERY = "(min-width: 1200px)"

function subscribeWide(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
  const media = window.matchMedia(WIDE_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

function wideSnapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY).matches : false
}

const wideServerSnapshot = () => false

/**
 * The client orchestrator for the Conversation Studio (design §8, §9).
 *
 * It owns the rail, the active conversation, the thread, the composer and the
 * context pane, and it is the only place that talks to the Studio API. The
 * server-rendered page hands it the initial rail/detail/briefing so a reload
 * resumes the same conversation; every later change is fetched through
 * `lib/studio/client.ts`.
 *
 * Chat-first rules this component enforces:
 * - the conversation is continuous: prior turns stay in the thread, a reload
 *   resumes the `?chat=` conversation, and a new turn never clears history;
 * - a turn appears optimistically but the final persisted `message` event is
 *   authoritative;
 * - a failure never fabricates an answer: the owner's text is either kept in
 *   the thread (it was stored) or handed back to the composer (nothing was
 *   written), with a localized banner and an explicit retry;
 * - the Studio cannot approve, export or publish; the artifact card only saves
 *   a draft as a version.
 */
export function StudioView({
  locale,
  workspaceId,
  workspaceName,
  workspaceSlug,
  role,
  locationSlug: initialLocationSlug,
  locations,
  conversations: initialConversations,
  activeConversationId: initialActiveId,
  initialMessages,
  initialHasMore,
  contextSummary,
  chips,
}: StudioViewProps) {
  const t = studioText(locale)
  const canSaveVersions = role === "owner" || role === "manager"

  const [conversations, setConversations] = useState<StudioConversation[]>(initialConversations)
  const [activeId, setActiveId] = useState<string | null>(initialActiveId)
  const [messages, setMessages] = useState<StudioMessage[]>(initialMessages)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [locationSlug, setLocationSlug] = useState(initialLocationSlug)
  const [draftText, setDraftText] = useState("")
  const [evidence, setEvidence] = useState<StudioCitationRef[]>([])
  const [optimisticUser, setOptimisticUser] = useState<StudioMessage | null>(null)
  const [pending, setPending] = useState<{ stage: StudioStreamStage | null; text: string } | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<StudioThreadError | null>(null)
  const [retryText, setRetryText] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const [aiBlocked, setAiBlocked] = useState<AiBlocked | null>(null)
  const [railOpen, setRailOpen] = useState(false)
  // Desktop: the context pane is a pinned third column (default open).
  // Narrow: the same pane is a drawer (default closed, so nothing covers the thread).
  const [contextPinned, setContextPinned] = useState(true)
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false)
  const isWide = useSyncExternalStore(subscribeWide, wideSnapshot, wideServerSnapshot)
  const contextOpen = isWide ? contextPinned : contextDrawerOpen
  const [focusKey, setFocusKey] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const persistedUserRef = useRef(false)

  const locationId = locations.find((location) => location.slug === locationSlug)?.id ?? null
  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null
  const archived = activeConversation?.status === "archived"

  async function exportTranscript() {
    if (!activeConversation || exporting) return
    setExporting(true)
    setExportError(false)
    const result = await downloadStudioTranscript(workspaceId, activeConversation.id, locale)
    setExporting(false)
    if (!result.ok) setExportError(true)
  }

  function toggleContext() {
    if (isWide) setContextPinned((open) => !open)
    else setContextDrawerOpen((open) => !open)
  }

  function closeContext() {
    setContextPinned(false)
    setContextDrawerOpen(false)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setRailOpen(false)
      setContextDrawerOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function syncUrl(next: { chat?: string | null; location?: string }) {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (next.location !== undefined) url.searchParams.set("location", next.location)
    if (next.chat !== undefined) {
      if (next.chat) url.searchParams.set("chat", next.chat)
      else url.searchParams.delete("chat")
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`)
  }

  async function reconcile(conversationId: string, options: { afterSeq?: number; restoreText?: string } = {}): Promise<boolean> {
    const detail = await readStudioConversation(workspaceId, conversationId)
    if (!detail.ok) {
      setError({ code: detail.code, message: studioErrorText(t, detail.code), retryable: true })
      if (options.restoreText) setDraftText(options.restoreText)
      return false
    }
    setMessages(detail.data.messages)
    setHasMore(detail.data.hasMore)
    setConversations((current) => mergeConversation(current, detail.data.conversation))
    const after = options.afterSeq ?? 0
    const assistantArrived = detail.data.messages.some((message) => message.role === "assistant" && message.seq > after)
    if (!assistantArrived && options.restoreText) {
      const userStored = detail.data.messages.some((message) => message.role === "user" && message.content === options.restoreText && message.seq > after)
      if (!userStored) setDraftText(options.restoreText)
    }
    return assistantArrived
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || streaming || sending) return
    setError(null)
    setRetryText(null)
    setSending(true)

    let conversationId = activeId
    if (!conversationId) {
      const created = await createStudioConversation(workspaceId, locationId)
      if (!created.ok) {
        setSending(false)
        setDraftText(content)
        setError({ code: created.code, message: studioErrorText(t, created.code), retryable: isRetryableStudioFailure(created.code) })
        return
      }
      conversationId = created.data.id
      setConversations((current) => mergeConversation(current, created.data))
      setActiveId(created.data.id)
      setMessages([])
      setHasMore(false)
      syncUrl({ chat: created.data.id })
    }

    const baseSeq = messages.reduce((max, message) => Math.max(max, message.seq), 0)
    const optimistic = createLocalUserMessage(conversationId, content, baseSeq + 1)
    setOptimisticUser(optimistic)
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId && conversation.title.trim().length === 0
          ? { ...conversation, title: conversationTitleFromMessage(content), lastMessageAt: optimistic.createdAt }
          : conversation.id === conversationId
            ? { ...conversation, lastMessageAt: optimistic.createdAt }
            : conversation,
      ),
    )
    setPending({ stage: "reading", text: "" })
    setStreaming(true)
    setSending(false)
    setDraftText("")
    persistedUserRef.current = false

    const controller = new AbortController()
    abortRef.current = controller
    let userSeq = baseSeq
    let deliveredUser = false

    const documentVersionIds = evidence.filter((ref) => ref.source === "document").map((ref) => ref.documentVersionId)
    const searchBriefIds = evidence.filter((ref) => ref.source === "search_brief").map((ref) => ref.searchBriefId)
    const result = await streamStudioMessage(
      workspaceId,
      conversationId,
      {
        text: content,
        ...(locationId ? { locationId } : {}),
        ...(documentVersionIds.length ? { documentVersionIds } : {}),
        ...(searchBriefIds.length ? { searchBriefIds } : {}),
      },
      {
        signal: controller.signal,
        locale,
        onEvent: (event) => {
          if (event.type === "status") {
            setPending((current) => ({ stage: event.stage, text: current?.text ?? "" }))
            return
          }
          if (event.type === "user") {
            deliveredUser = true
            persistedUserRef.current = true
            userSeq = event.message.seq
            setOptimisticUser(null)
            setMessages((current) => mergeMessage(current, event.message))
            return
          }
          if (event.type === "delta") {
            setPending((current) => ({ stage: current?.stage ?? "thinking", text: `${current?.text ?? ""}${event.text}` }))
            return
          }
          if (event.type === "message") {
            setPending(null)
            setMessages((current) => mergeMessage(current, event.message))
            setConversations((current) => mergeConversation(current, event.conversation))
          }
        },
      },
    )

    abortRef.current = null
    setStreaming(false)
    setPending(null)
    setSending(false)
    // Return focus to the composer once the turn settles (the disabled textarea
    // loses focus while streaming), so a conversation continues without a click.
    setFocusKey((key) => key + 1)

    if (result.ok) {
      setRetryText(null)
      return
    }

    // A second send while the first turn is still finishing is not a failure:
    // keep the text, say the turn is still running, and never offer a retry
    // button that would only race the in-flight turn again. The notice clears
    // itself once the server-side turn has had time to settle.
    if (result.code === "conversation_busy") {
      setOptimisticUser(null)
      setDraftText(content)
      setRetryText(null)
      setError({ code: result.code, message: studioErrorText(t, result.code), retryable: false })
      window.setTimeout(() => {
        setError((current) => current?.code === "conversation_busy" ? null : current)
      }, 8_000)
      return
    }

    if (result.code === "aborted") {
      setOptimisticUser(null)
      await reconcile(conversationId, { afterSeq: baseSeq, restoreText: content })
      return
    }

    if (deliveredUser || persistedUserRef.current) {
      // The owner's turn is stored. Keep the thread continuous: prefer the
      // persisted answer if it landed, otherwise say plainly that it stopped.
      setOptimisticUser(null)
      const recovered = await reconcile(conversationId, { afterSeq: userSeq })
      if (recovered) return
      setRetryText(content)
      setError({ code: result.code, message: studioErrorText(t, result.code), retryable: true })
      return
    }

    // Nothing was written: hand the text back instead of losing it.
    setOptimisticUser(null)
    setDraftText(content)
    setRetryText(content)
    if (result.code === "ai_paused" || result.code === "ai_unavailable") setAiBlocked(result.code)
    setError({ code: result.code, message: studioErrorText(t, result.code), retryable: isRetryableStudioFailure(result.code) })
  }

  function stopTurn() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
    setPending(null)
    setOptimisticUser(null)
    setFocusKey((key) => key + 1)
  }

  function retry() {
    const text = retryText
    setError(null)
    setRetryText(null)
    if (aiBlocked) setAiBlocked(null)
    if (text) void send(text)
  }

  async function selectConversation(conversationId: string) {
    if (streaming || sending) return
    if (conversationId === activeId) {
      setRailOpen(false)
      return
    }
    setError(null)
    setRetryText(null)
    setLoadingConversation(true)
    const result = await readStudioConversation(workspaceId, conversationId)
    setLoadingConversation(false)
    if (!result.ok) {
      setError({ code: result.code, message: studioErrorText(t, result.code), retryable: isRetryableStudioFailure(result.code) })
      return
    }
    setActiveId(result.data.conversation.id)
    setMessages(result.data.messages)
    setHasMore(result.data.hasMore)
    setConversations((current) => mergeConversation(current, result.data.conversation))
    setOptimisticUser(null)
    setPending(null)
    setDraftText("")
    syncUrl({ chat: result.data.conversation.id })
    setRailOpen(false)
    setFocusKey((key) => key + 1)
  }

  function newConversation() {
    if (streaming || sending) return
    setActiveId(null)
    setMessages([])
    setHasMore(false)
    setOptimisticUser(null)
    setPending(null)
    setError(null)
    setRetryText(null)
    setDraftText("")
    syncUrl({ chat: null })
    setRailOpen(false)
    setFocusKey((key) => key + 1)
  }

  function changeLocation(slug: string) {
    if (streaming || sending) return
    setLocationSlug(slug)
    setActiveId(null)
    setMessages([])
    setHasMore(false)
    setOptimisticUser(null)
    setPending(null)
    setError(null)
    setRetryText(null)
    setDraftText("")
    syncUrl({ location: slug, chat: null })
    setRailOpen(false)
    const scopedId = locations.find((location) => location.slug === slug)?.id ?? null
    void listStudioConversations(workspaceId, scopedId).then((result) => {
      if (result.ok) setConversations(result.data)
    })
  }

  async function archiveConversation(conversationId: string) {
    if (streaming || sending) return
    const result = await archiveStudioConversation(workspaceId, conversationId)
    if (!result.ok) {
      setError({ code: result.code, message: studioErrorText(t, result.code), retryable: isRetryableStudioFailure(result.code) })
      return
    }
    setConversations((current) => mergeConversation(current, result.data))
  }

  async function renameConversation(conversationId: string, title: string): Promise<boolean> {
    const result = await renameStudioConversation(workspaceId, conversationId, title)
    if (!result.ok) return false
    setConversations((current) => mergeConversation(current, result.data))
    return true
  }

  async function loadEarlier() {
    const conversationId = activeId
    const first = messages[0]
    if (!conversationId || !first || loadingEarlier) return
    setLoadingEarlier(true)
    const result = await readStudioConversation(workspaceId, conversationId, { beforeSeq: first.seq })
    setLoadingEarlier(false)
    if (!result.ok) {
      setError({ code: result.code, message: studioErrorText(t, result.code), retryable: true })
      return
    }
    setMessages((current) => {
      const known = new Set(current.map((message) => message.id))
      return [...result.data.messages.filter((message) => !known.has(message.id)), ...current]
    })
    setHasMore(result.data.hasMore)
  }

  const blockedNote = archived ? t.notices.archived : aiBlocked ? studioBlockedText(t, aiBlocked) : null
  const conversationReadOnly = activeConversation?.accessRole === "viewer"
  const composerDisabled = streaming || sending || loadingConversation || archived || conversationReadOnly

  return (
    <div className="studio-root" data-rail={railOpen ? "open" : "closed"} data-context-pinned={contextPinned ? "open" : "closed"} data-context-drawer={contextDrawerOpen ? "open" : "closed"}>
      <div className="studio-layout">
        <StudioConversationRail
          locale={locale}
          conversations={conversations}
          activeId={activeId}
          disabled={streaming || sending}
          open={railOpen}
          onClose={() => setRailOpen(false)}
          onSelect={(id) => void selectConversation(id)}
          onNew={newConversation}
          onArchive={(id) => void archiveConversation(id)}
          onRename={renameConversation}
        />

        <section className="studio-main" aria-label={t.nav.aria}>
          <header className="studio-header">
            <div className="studio-header-brand">
              <button type="button" className="studio-icon-button studio-rail-toggle" onClick={() => setRailOpen(true)} aria-label={t.rail.open} title={t.rail.open}>
                <Menu aria-hidden="true" />
              </button>
              <div>
                <p className="studio-header-eyebrow">{workspaceName}</p>
                <h1>{t.header.title}</h1>
              </div>
            </div>
            <div className="studio-header-actions">
              {locations.length > 0 && (
                <label className="studio-location">
                  <span className="sr-only">{t.context.location}</span>
                  <select value={locationSlug} onChange={(event) => changeLocation(event.target.value)} disabled={streaming || sending} aria-label={t.context.location}>
                    {locations.map((location) => (
                      <option key={location.id} value={location.slug}>{location.name}</option>
                    ))}
                    {locationSlug === "all" && <option value="all">{workspaceName}</option>}
                  </select>
                </label>
              )}
              {activeConversation && (
                <Button type="button" size="sm" variant="outline" onClick={() => void exportTranscript()} disabled={exporting}>
                  <Download aria-hidden="true" />
                  <span>{exporting ? t.transcript.exporting : t.transcript.export}</span>
                </Button>
              )}
              {activeConversation?.accessRole === "owner" && !archived && (
                <Button type="button" size="sm" variant="outline" onClick={() => setShareOpen(true)}>
                  <Share2 aria-hidden="true" />
                  <span>{t.share.action}</span>
                </Button>
              )}
              <button
                type="button"
                className="studio-icon-button studio-context-toggle"
                onClick={toggleContext}
                aria-label={contextOpen ? t.header.hideContext : t.header.context}
                aria-expanded={contextOpen}
                suppressHydrationWarning
                title={contextOpen ? t.header.hideContext : t.header.context}
              >
                <PanelRight aria-hidden="true" />
              </button>
              <Button type="button" size="sm" className="studio-new-chat" onClick={newConversation} disabled={streaming || sending} aria-label={t.header.newChat}>
                <Plus aria-hidden="true" />
                <span>{t.header.newChat}</span>
              </Button>
            </div>
          </header>
          <p className="studio-header-subtitle">{t.header.subtitle}</p>
          {exportError && <p className="studio-role-note" role="alert">{t.transcript.failed}</p>}

          {loadingConversation ? (
            <div className="studio-thread-region">
              <div className="studio-thread" aria-busy="true">
                <p className="studio-status" role="status">
                  <span className="studio-typing" aria-hidden="true"><span /><span /><span /></span>
                  <span>{t.status.reading}</span>
                </p>
              </div>
            </div>
          ) : (
            <StudioMessageThread
              locale={locale}
              workspaceSlug={workspaceSlug}
              locationSlug={locationSlug}
              messages={messages}
              optimisticUser={optimisticUser}
              pending={pending}
              streaming={streaming}
              hasMore={hasMore}
              loadingEarlier={loadingEarlier}
              onLoadEarlier={() => void loadEarlier()}
              error={error}
              onRetry={retry}
              canSaveVersions={canSaveVersions}
              empty={
                <StudioEmptyState
                  locale={locale}
                  workspaceName={workspaceName}
                  chips={chips}
                  disabled={streaming || sending}
                  onStarter={(message) => void send(message)}
                />
              }
            />
          )}

          {role === "viewer" && <p className="studio-role-note">{t.notices.viewer}</p>}
          {conversationReadOnly && <p className="studio-role-note">{t.notices.viewerShared}</p>}
          <StudioEvidencePicker
            locale={locale}
            workspaceId={workspaceId}
            locationId={locationId}
            selected={evidence}
            onChange={setEvidence}
            disabled={composerDisabled}
          />
          <StudioComposer
            locale={locale}
            value={draftText}
            onChange={setDraftText}
            onSend={() => void send(draftText)}
            onStop={stopTurn}
            streaming={streaming}
            disabled={composerDisabled}
            blockedNote={blockedNote}
            onClearBlocked={aiBlocked ? () => setAiBlocked(null) : undefined}
            focusKey={focusKey}
          />
        </section>

        <StudioContextPanel locale={locale} summary={contextSummary} open={contextOpen} onClose={closeContext} focusOnOpen={!isWide && contextDrawerOpen} newActionHref={canSaveVersions && locationSlug !== "all" ? `/${locale}/owner/${workspaceSlug}/actions/new?location=${encodeURIComponent(locationSlug)}` : undefined} />
      </div>
      {shareOpen && activeConversation && (
        <StudioShareDialog locale={locale} workspaceId={workspaceId} conversationId={activeConversation.id} onClose={() => setShareOpen(false)} />
      )}
      <button type="button" className="studio-overlay" aria-label={t.rail.close} tabIndex={-1} onClick={() => { setRailOpen(false); closeContext() }} />
    </div>
  )
}
