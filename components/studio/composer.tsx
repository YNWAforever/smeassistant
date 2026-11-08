"use client"

import { ArrowUp, Square } from "lucide-react"
import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { formatStudioCopy, studioText } from "@/lib/studio/copy"
import { STUDIO_MESSAGE_MAX } from "@/lib/studio/types"

/**
 * The only form in the Studio (design §3). It auto-grows, Enter sends,
 * Shift+Enter inserts a newline, and IME composition never sends mid-word
 * (important for zh-HK/zh-TW input). While a turn streams the send button is
 * replaced by Stop, so a slow provider is interruptible and the thread stays
 * honest. `focusKey` changes move focus back here after a new conversation or
 * a rail selection.
 */
export function StudioComposer({
  locale,
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled = false,
  blockedNote,
  onClearBlocked,
  focusKey,
  maxLength = STUDIO_MESSAGE_MAX,
}: {
  locale: PrototypeLocale
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  streaming: boolean
  disabled?: boolean
  blockedNote?: string | null
  onClearBlocked?: () => void
  focusKey?: number
  maxLength?: number
}) {
  const t = studioText(locale)
  const textarea = useRef<HTMLTextAreaElement>(null)

  // Auto-grow up to a readable ceiling; beyond that the textarea scrolls.
  useEffect(() => {
    const node = textarea.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${Math.min(node.scrollHeight, 208)}px`
  }, [value])

  useEffect(() => {
    if (focusKey === undefined) return
    textarea.current?.focus()
  }, [focusKey])

  const tooLong = value.length > maxLength
  const canSend = !streaming && !disabled && value.trim().length > 0 && !tooLong
  const submit = () => {
    if (!canSend) return
    onSend()
  }

  return (
    <div className="studio-composer" data-streaming={streaming ? "true" : "false"}>
      <form
        className="studio-composer-form"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className="sr-only" htmlFor="studio-composer-input">
          {t.composer.label}
        </label>
        <textarea
          id="studio-composer-input"
          ref={textarea}
          className="studio-composer-input"
          rows={1}
          value={value}
          placeholder={t.composer.placeholder}
          disabled={disabled}
          aria-invalid={tooLong || undefined}
          aria-describedby="studio-composer-hint"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return
            // `isComposing` covers IME candidate selection; sending on that
            // Enter would submit a half-typed Chinese message.
            if (event.nativeEvent.isComposing) return
            event.preventDefault()
            submit()
          }}
        />
        {streaming ? (
          <Button type="button" variant="outline" className="studio-send studio-stop" onClick={onStop} aria-label={t.composer.stop}>
            <Square aria-hidden="true" />
            <span className="studio-send-label">{t.composer.stop}</span>
          </Button>
        ) : (
          <Button type="submit" className="studio-send" disabled={!canSend} aria-label={t.composer.send}>
            <ArrowUp aria-hidden="true" />
            <span className="studio-send-label">{t.composer.send}</span>
          </Button>
        )}
      </form>
      <div className="studio-composer-meta" id="studio-composer-hint">
        <span>{tooLong ? formatStudioCopy(t.composer.tooLong, { max: maxLength }) : t.composer.hint}</span>
        <span className="studio-composer-count" aria-hidden="true">
          {value.length}/{maxLength}
        </span>
      </div>
      {blockedNote && (
        <p className="studio-composer-blocked" role="status">
          <span>{blockedNote}</span>
          {onClearBlocked && (
            <button type="button" className="studio-text-button" onClick={onClearBlocked}>
              {t.message.retry}
            </button>
          )}
        </p>
      )}
    </div>
  )
}
