"use client"

import Link from "next/link"
import { ArrowLeft, Download, FileText, Menu, MoreHorizontal, PanelRight, Plus, Share2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

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
import { LegacyNotesBanner } from "./legacy-notes-banner"
import { StudioMessageThread, type StudioThreadError } from "./message-thread"
import { StudioShareDialog } from "./share-dialog"
import { studioBlockedText, studioErrorText } from "./studio-errors"

export type StudioViewProps = {
  locale: PrototypeLocale
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  userId: string
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
type Recovery = { conversationId: string; afterSeq: number; text: string }
type RetryIntent =
  | { kind: "send"; text: string }
  | { kind: "select"; conversationId: string }
  | { kind: "history" }
  | { kind: "archive"; conversationId: string }
  | ({ kind: "recover" } & Recovery)

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
  userId,
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
  const [retryIntent, setRetryIntent] = useState<RetryIntent | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const [aiBlocked, setAiBlocked] = useState<AiBlocked | null>(null)
  const [railOpen, setRailOpen] = useState(false)
  // Context is on-demand at every width: a sheet over the thread, never a
  // permanent third column competing with the conversation.
  const [contextOpen, setContextOpen] = useState(false)
  const [focusKey, setFocusKey] = useState(0)
  const [newChatKey, setNewChatKey] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const moreSummaryRef = useRef<HTMLElement>(null)
  // Every navigation or new turn owns its asynchronous results. A stopped
  // request may still settle after the owner starts another discussion.
  const operationRef = useRef(0)

  function beginOperation() {
    operationRef.current += 1
    setRecovering(false)
    setLoadingConversation(false)
    setLoadingEarlier(false)
    return operationRef.current
  }

  function restoreTurnFocus() {
    const active = document.activeElement
    if (document.querySelector('[aria-modal="true"]')) return
    if (!active || active === document.body || active.closest(".studio-composer")) {
      setFocusKey((key) => key + 1)
    }
  }

  useEffect(() => () => {
    operationRef.current += 1
    abortRef.current?.abort()
  }, [])

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
    setRailOpen(false)
    setShareOpen(false)
    setContextOpen((open) => !open)
  }

  function closeContext() {
    setContextOpen(false)
  }

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

  async function reconcile(recovery: Recovery, operation: number) {
    setRecovering(true)
    const detail = await readStudioConversation(workspaceId, recovery.conversationId)
    if (operation !== operationRef.current) return
    setRecovering(false)
    restoreTurnFocus()
    setRetryIntent({ kind: "recover", ...recovery })
    if (!detail.ok) {
      setDraftText((current) => current || recovery.text)
      setError({ code: detail.code, message: studioErrorText(t, detail.code), retryable: true, retryLabel: t.message.checkResponse })
      return
    }
    setMessages(detail.data.messages)
    setHasMore(detail.data.hasMore)
    setConversations((current) => mergeConversation(current, detail.data.conversation))
    const user = detail.data.messages.find((message) => message.role === "user" && message.content === recovery.text && message.seq > recovery.afterSeq)
    const assistantArrived = user && detail.data.messages.some((message) => message.role === "assistant" && message.seq > user.seq)
    if (user) setDraftText((current) => current === recovery.text ? "" : current)
    if (assistantArrived) {
      setError(null)
      setRetryIntent(null)
      return
    }
    // A missing acknowledgement is not proof of rollback. Read history again
    // on recovery; never automatically append a second copy of this question.
    if (!user) setDraftText((current) => current || recovery.text)
    setError({ code: "stream", message: t.message.responsePending, retryable: true, retryLabel: t.message.checkResponse })
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || streaming || sending || recovering || loadingConversation) return
    const operation = beginOperation()
    setError(null)
    setRetryIntent(null)
    setSending(true)

    let conversationId = activeId
    if (!conversationId) {
      const created = await createStudioConversation(workspaceId, locationId)
      if (operation !== operationRef.current) return
      if (!created.ok) {
        setSending(false)
        setDraftText(content)
        setRetryIntent({ kind: "send", text: content })
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

    const controller = new AbortController()
    abortRef.current = controller
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
          if (operation !== operationRef.current) return
          if (event.type === "status") {
            setPending((current) => ({ stage: event.stage, text: current?.text ?? "" }))
            return
          }
          if (event.type === "user") {
            deliveredUser = true
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

    if (operation !== operationRef.current) return
    abortRef.current = null
    setStreaming(false)
    setPending(null)
    setSending(false)
    // Restore only focus owned by this turn, never an overlay or another control.
    restoreTurnFocus()

    if (result.ok) {
      setRetryIntent(null)
      return
    }

    // A busy refusal did not accept this new question. Keep its text without
    // treating an arbitrary timer as proof that the server finished.
    if (result.code === "conversation_busy") {
      setOptimisticUser(null)
      setDraftText(content)
      setRetryIntent(null)
      setError({ code: result.code, message: studioErrorText(t, result.code), retryable: false })
      return
    }

    if (deliveredUser || result.code === "aborted" || result.code === "network" || result.code === "stream" || result.status >= 500) {
      setOptimisticUser(null)
      await reconcile({ conversationId, afterSeq: baseSeq, text: content }, operation)
      return
    }

    // A definite pre-write refusal can be retried as a new submission.
    setOptimisticUser(null)
    setDraftText(content)
    setRetryIntent({ kind: "send", text: content })
    if (result.code === "ai_paused" || result.code === "ai_unavailable") setAiBlocked(result.code)
    setError({ code: result.code, message: studioErrorText(t, result.code), retryable: isRetryableStudioFailure(result.code) })
  }

  function stopTurn() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
    setPending(null)
    setOptimisticUser(null)
    restoreTurnFocus()
  }

  function retry() {
    if (recovering || streaming || sending || loadingConversation || loadingEarlier) return
    const intent = retryIntent
    if (!intent) return
    setError(null)
    setRetryIntent(null)
    if (intent.kind === "recover") void reconcile(intent, beginOperation())
    if (intent.kind === "select") void selectConversation(intent.conversationId)
    if (intent.kind === "history") void loadEarlier()
    if (intent.kind === "archive") void archiveConversation(intent.conversationId)
    if (intent.kind === "send") {
      if (aiBlocked) setAiBlocked(null)
      void send(intent.text)
    }
  }

  async function selectConversation(conversationId: string) {
    if (streaming || sending) return
    setRailOpen(false)
    if (conversationId === activeId && !loadingConversation) {
      setFocusKey((key) => key + 1)
      return
    }
    setError(null)
    setRetryIntent(null)
    const operation = beginOperation()
    setLoadingConversation(true)
    const result = await readStudioConversation(workspaceId, conversationId)
    if (operation !== operationRef.current) return
    setLoadingConversation(false)
    if (!result.ok) {
      restoreTurnFocus()
      setRetryIntent({ kind: "select", conversationId })
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
    beginOperation()
    // Starting over also replaces an unsaved draft whose activeId is still null.
    setNewChatKey((key) => key + 1)
    setActiveId(null)
    setMessages([])
    setHasMore(false)
    setOptimisticUser(null)
    setPending(null)
    setError(null)
    setRetryIntent(null)
    setDraftText("")
    syncUrl({ chat: null })
    setRailOpen(false)
    setFocusKey((key) => key + 1)
  }

  function changeLocation(slug: string) {
    if (streaming || sending) return
    const operation = beginOperation()
    setLocationSlug(slug)
    setActiveId(null)
    setMessages([])
    setHasMore(false)
    setOptimisticUser(null)
    setPending(null)
    setError(null)
    setRetryIntent(null)
    setDraftText("")
    syncUrl({ location: slug, chat: null })
    setRailOpen(false)
    const scopedId = locations.find((location) => location.slug === slug)?.id ?? null
    void listStudioConversations(workspaceId, scopedId).then((result) => {
      if (operation === operationRef.current && result.ok) setConversations(result.data)
    })
  }

  async function archiveConversation(conversationId: string) {
    if (streaming || sending) return
    const operation = operationRef.current
    const result = await archiveStudioConversation(workspaceId, conversationId)
    if (operation !== operationRef.current) return
    if (!result.ok) {
      setRetryIntent({ kind: "archive", conversationId })
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
    const operation = operationRef.current
    setLoadingEarlier(true)
    const result = await readStudioConversation(workspaceId, conversationId, { beforeSeq: first.seq })
    if (operation !== operationRef.current) return
    setLoadingEarlier(false)
    if (!result.ok) {
      setRetryIntent({ kind: "history" })
      setError({ code: result.code, message: studioErrorText(t, result.code), retryable: isRetryableStudioFailure(result.code) })
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
  const composerDisabled = streaming || sending || recovering || loadingConversation || archived || conversationReadOnly
  const homeHref = `/${locale}/owner/${workspaceSlug}?location=${encodeURIComponent(locationSlug)}`
  const notesHref = `/${locale}/owner/${workspaceSlug}/conversation/notes?location=${encodeURIComponent(locationSlug)}`

  return (
    <div className="studio-root" data-rail={railOpen ? "open" : "closed"} data-context-drawer={contextOpen ? "open" : "closed"}>
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
              <Link className="studio-back" href={homeHref} aria-label={t.header.back} title={t.header.back}>
                <ArrowLeft aria-hidden="true" />
              </Link>
              <button type="button" className="studio-icon-button studio-rail-toggle" onClick={() => { setContextOpen(false); setShareOpen(false); setRailOpen(true) }} aria-label={t.rail.open} title={t.rail.open}>
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
              <button
                type="button"
                className="studio-icon-button studio-context-toggle"
                onClick={toggleContext}
                aria-label={contextOpen ? t.header.hideContext : t.header.context}
                aria-expanded={contextOpen}
                title={contextOpen ? t.header.hideContext : t.header.context}
              >
                <PanelRight aria-hidden="true" />
              </button>
              <Button type="button" size="sm" className="studio-new-chat" onClick={newConversation} disabled={streaming || sending} aria-label={t.header.newChat}>
                <Plus aria-hidden="true" />
                <span>{t.header.newChat}</span>
              </Button>
              <details className="studio-more">
                <summary ref={moreSummaryRef} className="studio-icon-button studio-more-toggle" aria-label={t.header.more} title={t.header.more}>
                  <MoreHorizontal aria-hidden="true" />
                </summary>
                <div className="studio-more-menu">
                  {activeConversation && (
                    <button type="button" onClick={() => void exportTranscript()} disabled={exporting}>
                      <Download aria-hidden="true" />
                      <span>{exporting ? t.transcript.exporting : t.transcript.export}</span>
                    </button>
                  )}
                  {activeConversation?.accessRole === "owner" && !archived && (
                    <button type="button" onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open")
                      setContextOpen(false)
                      setRailOpen(false)
                      setShareOpen(true)
                    }}>
                      <Share2 aria-hidden="true" />
                      <span>{t.share.action}</span>
                    </button>
                  )}
                  <Link href={notesHref}>
                    <FileText aria-hidden="true" />
                    <span>{t.header.oldNotes}</span>
                  </Link>
                </div>
              </details>
            </div>
          </header>
          {exportError && <p className="studio-role-note" role="alert">{t.transcript.failed}</p>}
          <LegacyNotesBanner
            locale={locale}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            userId={userId}
            locationId={locationId}
            locationSlug={locationSlug}
          />

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
              conversationId={activeId}
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
            canUpload={role === "owner"}
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
            dictationContext={JSON.stringify([workspaceId, locationSlug, activeId, newChatKey])}
          />
        </section>

        <StudioContextPanel locale={locale} summary={contextSummary} open={contextOpen} onClose={closeContext} focusOnOpen={contextOpen} newActionHref={canSaveVersions && locationSlug !== "all" ? `/${locale}/owner/${workspaceSlug}/actions/new?location=${encodeURIComponent(locationSlug)}` : undefined} actionHrefBase={`/${locale}/owner/${workspaceSlug}/actions`} actionLocation={locationSlug} />
      </div>
      {shareOpen && activeConversation && (
        <StudioShareDialog locale={locale} workspaceId={workspaceId} conversationId={activeConversation.id} onClose={() => setShareOpen(false)} returnFocusRef={moreSummaryRef} />
      )}
      <button type="button" className="studio-overlay" aria-label={t.rail.close} tabIndex={-1} onClick={() => { setRailOpen(false); closeContext() }} />
    </div>
  )
}
