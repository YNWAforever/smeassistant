"use client"

import { ArrowUp, Mic, MicOff, Square } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { formatStudioCopy, studioText } from "@/lib/studio/copy"
import {
  appendTranscript,
  finalTranscript,
  speechLanguage,
  speechRecognitionConstructor,
  type StudioSpeechRecognition,
} from "@/lib/studio/speech"
import { STUDIO_MESSAGE_MAX } from "@/lib/studio/types"

type VoiceError = "denied" | "failed"

const subscribeToSpeechSupport = () => () => {}
const readSpeechSupport = () => speechRecognitionConstructor() !== null
const readServerSpeechSupport = () => false

/**
 * The only form in the Studio (design §3). It auto-grows, Enter sends,
 * Shift+Enter inserts a newline, and IME composition never sends mid-word
 * (important for zh-HK/zh-TW input). While a turn streams the send button is
 * replaced by Stop, so a slow provider is interruptible and the thread stays
 * honest. `focusKey` changes move focus back here after a new conversation or
 * a rail selection.
 *
 * Dictation is progressive enhancement: browsers without the Web Speech API
 * never see a microphone, and the browser performs recognition locally through
 * its provider — no audio is uploaded or stored by this app. Only the resulting
 * transcript is appended to the owner's draft, and the owner still sends the
 * message explicitly.
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
  dictationContext = "",
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
  /** Conversation/location/new-chat identity, independent of focus restoration. */
  dictationContext?: string
  maxLength?: number
}) {
  const t = studioText(locale)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const draft = useRef(value)
  const recognition = useRef<StudioSpeechRecognition | null>(null)
  const stopping = useRef(false)
  // The microphone appears only where speech recognition exists. The server
  // snapshot is false so the server markup and the hydration render agree;
  // React then re-reads the client snapshot.
  const voiceSupported = useSyncExternalStore(subscribeToSpeechSupport, readSpeechSupport, readServerSpeechSupport)
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState<VoiceError | null>(null)

  // Auto-grow up to a readable ceiling; beyond that the textarea scrolls.
  useEffect(() => {
    const node = textarea.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${Math.min(node.scrollHeight, 208)}px`
  }, [value])

  const cancelVoice = useCallback(() => {
    const active = recognition.current
    // Fence callbacks before abort(), which may itself dispatch terminal events.
    recognition.current = null
    stopping.current = false
    active?.abort()
    setListening(false)
  }, [])

  useLayoutEffect(() => {
    // Input and transcript handlers update this ref synchronously. A different
    // controlled value therefore replaces the draft owned by the recognizer.
    if (draft.current !== value) cancelVoice()
    draft.current = value
  }, [value, cancelVoice])

  // Cleanup runs before the new context can receive browser callbacks, and on
  // unmount. Ordinary focus restoration deliberately does not end dictation.
  useLayoutEffect(() => () => cancelVoice(), [dictationContext, locale, disabled, cancelVoice])

  // An idle draft owns its recognizer until a turn starts. Fence it while
  // leaving idle; an explicit recognizer started during streaming may survive
  // completion when the caller keeps the composer enabled.
  useLayoutEffect(() => () => {
    if (!streaming) cancelVoice()
  }, [streaming, cancelVoice])

  useEffect(() => {
    if (focusKey === undefined) return
    textarea.current?.focus()
  }, [focusKey])

  const tooLong = value.length > maxLength
  const canSend = !streaming && !disabled && value.trim().length > 0 && !tooLong
  const submit = () => {
    if (!canSend) return
    cancelVoice()
    onSend()
  }

  function stopVoice() {
    const active = recognition.current
    // stop() may deliver one final result before end. Keep ownership until the
    // draft/context changes, another recognizer starts, or this one terminates.
    stopping.current = true
    active?.stop()
    setListening(false)
  }

  function startVoice() {
    if (disabled) return
    if (listening) {
      stopVoice()
      return
    }
    cancelVoice()
    const Recognition = speechRecognitionConstructor()
    if (!Recognition) {
      setVoiceError("failed")
      return
    }
    const next = new Recognition()
    next.lang = speechLanguage(locale)
    next.continuous = true
    next.interimResults = false
    next.onresult = (event) => {
      if (recognition.current !== next) return
      const transcript = finalTranscript(event)
      if (!transcript) return
      draft.current = appendTranscript(draft.current, transcript)
      onChange(draft.current)
    }
    next.onerror = (event) => {
      if (recognition.current !== next) return
      recognition.current = null
      stopping.current = false
      setListening(false)
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setVoiceError("denied")
      else if (event.error !== "aborted" && event.error !== "no-speech") setVoiceError("failed")
    }
    next.onend = () => {
      if (recognition.current !== next) return
      recognition.current = null
      stopping.current = false
      setListening(false)
    }
    recognition.current = next
    try {
      next.start()
      setVoiceError(null)
      setListening(true)
    } catch {
      recognition.current = null
      setVoiceError("failed")
    }
  }

  const voiceLabel = listening ? t.composer.voiceStop : t.composer.voiceStart
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
          onChange={(event) => {
            if (stopping.current) cancelVoice()
            draft.current = event.target.value
            onChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return
            // `isComposing` covers IME candidate selection; sending on that
            // Enter would submit a half-typed Chinese message.
            if (event.nativeEvent.isComposing) return
            event.preventDefault()
            submit()
          }}
        />
        {voiceSupported && (
          <Button
            type="button"
            variant="outline"
            className="studio-composer-voice"
            data-listening={listening ? "true" : "false"}
            aria-pressed={listening}
            aria-label={voiceLabel}
            title={voiceLabel}
            disabled={disabled}
            onClick={startVoice}
          >
            {listening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </Button>
        )}
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
        <span>{listening ? t.composer.listening : tooLong ? formatStudioCopy(t.composer.tooLong, { max: maxLength }) : t.composer.hint}</span>
        <span className="studio-composer-count" aria-hidden="true">
          {value.length}/{maxLength}
        </span>
      </div>
      {voiceError && (
        <p className="studio-composer-voice-note" role="status">
          {voiceError === "denied" ? t.composer.voiceDenied : t.composer.voiceFailed}
        </p>
      )}
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
