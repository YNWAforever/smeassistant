"use client"

import { LoaderCircle, TriangleAlert } from "lucide-react"
import { useLayoutEffect, useRef, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { studioText } from "@/lib/studio/copy"
import type { StudioMessage, StudioStreamStage } from "@/lib/studio/types"

import { StudioMessageBubble } from "./message-bubble"

export type StudioThreadError = {
  code: string
  message: string
  retryable: boolean
  retryLabel?: string
}

/**
 * The continuous thread (design §3 "Thread", §8 "Accessibility").
 *
 * `role="log"` with `aria-live="polite"` announces each appended turn without
 * interrupting the owner. A stable stage announcer sits outside the busy log;
 * partial tokens stay visual until the final message enters the log. History
 * preserves the reading anchor; new content follows only at the bottom. Only
 * the thread scrolls, so the page and composer stay put.
 */
export function StudioMessageThread({
  locale,
  workspaceSlug,
  locationSlug,
  conversationId,
  messages,
  optimisticUser,
  pending,
  streaming,
  hasMore,
  loadingEarlier,
  onLoadEarlier,
  error,
  onRetry,
  canSaveVersions,
  empty,
}: {
  locale: PrototypeLocale
  workspaceSlug: string
  locationSlug: string
  conversationId?: string | null
  messages: StudioMessage[]
  optimisticUser: StudioMessage | null
  pending: { stage: StudioStreamStage | null; text: string } | null
  streaming: boolean
  hasMore: boolean
  loadingEarlier: boolean
  onLoadEarlier: () => void
  error: StudioThreadError | null
  onRetry: () => void
  canSaveVersions: boolean
  empty?: ReactNode
}) {
  const t = studioText(locale)
  const thread = useRef<HTMLDivElement>(null)
  const earlierHadFocus = useRef(false)
  const position = useRef<{
    conversation: string | null
    firstId: string | undefined
    anchor: HTMLElement | null
    offset: number
    atBottom: boolean
  } | null>(null)
  const conversation = conversationId ?? messages[0]?.conversationId ?? null

  function rememberPosition() {
    const node = thread.current
    if (!node) return
    const top = node.getBoundingClientRect().top + node.clientTop
    const anchor = Array.from(node.querySelectorAll<HTMLElement>(".studio-messages > li"))
      .find((row) => row.getBoundingClientRect().bottom > top) ?? null
    position.current = {
      conversation,
      firstId: messages[0]?.id,
      anchor,
      offset: anchor ? anchor.getBoundingClientRect().top - top : 0,
      // Allow only rounding error, not a whole message, when deciding to follow.
      atBottom: node.scrollHeight - node.clientHeight - node.scrollTop <= 2,
    }
  }

  // The previous committed layout (updated on reader scroll) is the before
  // snapshot. Measure the new layout before paint, including token-only updates.
  useLayoutEffect(() => {
    const node = thread.current
    if (!node) return
    const before = position.current
    const sameConversation = before?.conversation === conversation
    const prepended = sameConversation && before?.firstId !== undefined
      && messages.findIndex((message) => message.id === before.firstId) > 0
    if (!before || !sameConversation || (before.atBottom && !prepended)) {
      node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight)
    } else if (before.anchor && node.contains(before.anchor)) {
      const top = node.getBoundingClientRect().top + node.clientTop
      node.scrollTop += before.anchor.getBoundingClientRect().top - top - before.offset
    }
    if (!hasMore && earlierHadFocus.current) {
      // A removed/disabled button may leave focus on body. Do not take it back
      // if the owner already moved to the composer or another control.
      if (document.activeElement === document.body) node.focus({ preventScroll: true })
      earlierHadFocus.current = false
    }
    rememberPosition()
  })

  const stageLabel = pending?.stage ? t.status[pending.stage] : t.status.reading
  const showEmpty = messages.length === 0 && !optimisticUser && !pending && !streaming

  return (
    <div className="studio-thread-region">
      {/* A final message clears pending before the stream terminator arrives. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{pending ? stageLabel : ""}</div>
      <div ref={thread} onScroll={rememberPosition} tabIndex={-1} className="studio-thread" role="log" aria-live="polite" aria-relevant="additions" aria-label={t.header.title} aria-busy={streaming || undefined}>
        {hasMore && (
          <div className="studio-thread-earlier">
            <Button type="button" variant="outline" size="sm"
              onFocus={() => { earlierHadFocus.current = true }}
              onBlur={(event) => { if (event.relatedTarget) earlierHadFocus.current = false }}
              onClick={() => { rememberPosition(); onLoadEarlier() }} disabled={loadingEarlier}>
              {loadingEarlier ? <LoaderCircle className="studio-spin" aria-hidden="true" /> : null}
              {t.thread.loadEarlier}
            </Button>
          </div>
        )}
        {showEmpty && empty}
        <ol className="studio-messages" aria-label={t.rail.listLabel}>
          {messages.map((message) => (
            <li key={message.id}>
              <StudioMessageBubble
                locale={locale}
                workspaceSlug={workspaceSlug}
                locationSlug={locationSlug}
                conversationId={conversationId}
                message={message}
                canSaveVersions={canSaveVersions}
              />
            </li>
          ))}
          {optimisticUser && (
            <li>
              <StudioMessageBubble
                locale={locale}
                workspaceSlug={workspaceSlug}
                locationSlug={locationSlug}
                conversationId={conversationId}
                message={optimisticUser}
                canSaveVersions={canSaveVersions}
                pending
              />
            </li>
          )}
          {pending && (
            <li>
              <div className="studio-message studio-message-assistant studio-pending" aria-hidden="true">
                <header className="studio-message-head">
                  <span className="studio-message-role">{t.message.assistant}</span>
                </header>
                <div className="studio-message-parts">
                  {pending.text.length > 0 ? (
                    <p className="studio-message-text studio-streaming-text" dir="auto">{pending.text}</p>
                  ) : null}
                  <p className="studio-status">
                    <span className="studio-typing" aria-hidden="true"><span /><span /><span /></span>
                    <span>{stageLabel}</span>
                  </p>
                </div>
              </div>
            </li>
          )}
        </ol>
        <div className="studio-thread-end" aria-hidden="true" />
      </div>
      {error && (
        <div className="studio-error-banner" role="alert">
          <TriangleAlert aria-hidden="true" />
          <div>
            <p>{error.message}</p>
            {error.retryable && (
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>{error.retryLabel ?? t.message.retry}</Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
