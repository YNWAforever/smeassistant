"use client"

import { LoaderCircle, TriangleAlert } from "lucide-react"
import { useEffect, useRef, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { studioText } from "@/lib/studio/copy"
import type { StudioMessage, StudioStreamStage } from "@/lib/studio/types"

import { StudioMessageBubble } from "./message-bubble"

export type StudioThreadError = {
  code: string
  message: string
  retryable: boolean
}

/**
 * The continuous thread (design §3 "Thread", §8 "Accessibility").
 *
 * `role="log"` with `aria-live="polite"` announces each appended turn without
 * interrupting the owner; the streaming stage has its own polite region so a
 * screen reader hears "Reading the latest evidence…" then the answer. The
 * thread scrolls to the newest turn, but only the thread scrolls — the page
 * itself and the composer stay put.
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
  const end = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)

  useEffect(() => {
    const count = messages.length + (optimisticUser ? 1 : 0)
    if (count === lastCount.current) return
    lastCount.current = count
    const node = end.current
    if (!node || typeof node.scrollIntoView !== "function") return
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    node.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" })
  }, [messages.length, optimisticUser])

  const stageLabel = pending?.stage ? t.status[pending.stage] : t.status.reading
  const showEmpty = messages.length === 0 && !optimisticUser && !pending && !streaming

  return (
    <div className="studio-thread-region">
      <div className="studio-thread" role="log" aria-live="polite" aria-relevant="additions text" aria-label={t.header.title} aria-busy={streaming || undefined}>
        {hasMore && (
          <div className="studio-thread-earlier">
            <Button type="button" variant="outline" size="sm" onClick={onLoadEarlier} disabled={loadingEarlier}>
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
              <div className="studio-message studio-message-assistant studio-pending" aria-live="polite">
                <header className="studio-message-head">
                  <span className="studio-message-role">{t.message.assistant}</span>
                </header>
                <div className="studio-message-parts">
                  {pending.text.length > 0 ? (
                    <p className="studio-message-text studio-streaming-text" dir="auto">{pending.text}</p>
                  ) : null}
                  <p className="studio-status" role="status">
                    <span className="studio-typing" aria-hidden="true"><span /><span /><span /></span>
                    <span>{stageLabel}</span>
                  </p>
                </div>
              </div>
            </li>
          )}
        </ol>
        <div ref={end} className="studio-thread-end" aria-hidden="true" />
      </div>
      {error && (
        <div className="studio-error-banner" role="alert">
          <TriangleAlert aria-hidden="true" />
          <div>
            <p>{error.message}</p>
            {error.retryable && (
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t.message.retry}</Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
