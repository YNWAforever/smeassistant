"use client"

import Link from "next/link"
import { ArrowRight, CircleAlert, Copy, Check, TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import type { PrototypeLocale } from "@/lib/copy"
import { nextStepHref } from "@/lib/assistant/next-step"
import { studioText } from "@/lib/studio/copy"
import type { StudioArtifactPart, StudioCitationPart, StudioEvidencePart, StudioMessage, StudioMessagePart, StudioNextStepPart, StudioTextPart } from "@/lib/studio/types"
import type { EvidenceReference } from "@/lib/pocket-assistant/contracts"

import { StudioArtifactCard } from "./artifact-card"
import { StudioEvidenceChips } from "./evidence-chips"

function CopyButton({ locale, text }: { locale: PrototypeLocale; text: string }) {
  const t = studioText(locale)
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState("copied")
    } catch {
      setState("failed")
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), 2000)
  }
  const label = state === "copied" ? t.message.copied : state === "failed" ? t.message.copyFailed : t.message.copy
  return (
    <button type="button" className="studio-copy" onClick={copy} aria-label={label} title={label}>
      {state === "copied" ? <Check aria-hidden="true" /> : state === "failed" ? <CircleAlert aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span>{label}</span>
    </button>
  )
}

function textPart(part: StudioMessagePart): StudioTextPart | null {
  return part.kind === "text" ? part : null
}
function evidencePart(part: StudioMessagePart): StudioEvidencePart | null {
  return part.kind === "evidence" ? part : null
}
function citationPart(part: StudioMessagePart): StudioCitationPart | null {
  return part.kind === "citation" ? part : null
}
function artifactPart(part: StudioMessagePart): StudioArtifactPart | null {
  return part.kind === "artifact" ? part : null
}
function nextStepPart(part: StudioMessagePart): StudioNextStepPart | null {
  return part.kind === "next_step" ? part : null
}

/**
 * One turn in the conversation. A user turn is plain prose; an assistant turn
 * renders its persisted parts in order: prose, evidence chips, the inline draft
 * artifact, a navigation-only next step and any warnings the server attached.
 * `createdAt` is intentionally not rendered: server and browser time zones can
 * differ, and a clock is not what makes a conversation readable.
 */
export function StudioMessageBubble({
  locale,
  workspaceSlug,
  locationSlug,
  message,
  canSaveVersions,
  pending = false,
}: {
  locale: PrototypeLocale
  workspaceSlug: string
  locationSlug: string
  message: StudioMessage
  canSaveVersions: boolean
  pending?: boolean
}) {
  const t = studioText(locale)
  const isUser = message.role === "user"
  const basePath = `/${locale}/owner/${workspaceSlug}`

  const prose: ReactNode[] = []
  const evidence: EvidenceReference[][] = []
  const citations: StudioCitationPart[] = []
  const artifacts: StudioArtifactPart[] = []
  const nextSteps: ReactNode[] = []
  const warnings: { code: string; text: string }[] = []

  for (const part of message.parts) {
    const text = textPart(part)
    if (text) {
      if (text.text.trim().length > 0) prose.push(<p key={`text-${prose.length}`} className="studio-message-text" dir="auto">{text.text}</p>)
      continue
    }
    const chips = evidencePart(part)
    if (chips) {
      evidence.push(chips.refs)
      continue
    }
    const citation = citationPart(part)
    if (citation) {
      citations.push(citation)
      continue
    }
    const artifact = artifactPart(part)
    if (artifact) {
      artifacts.push(artifact)
      continue
    }
    const step = nextStepPart(part)
    if (step) {
      const href = nextStepHref(basePath, step.step, locationSlug === "all" ? undefined : locationSlug)
      if (href) {
        const label = step.step.kind === "review_version" ? t.message.reviewVersion : t.message.openAction
        nextSteps.push(
          <p key={`step-${nextSteps.length}`} className="studio-next-step">
            <Link href={href}>{label}<ArrowRight aria-hidden="true" /></Link>
          </p>,
        )
      }
      continue
    }
    if (part.kind === "warning") warnings.push({ code: part.code, text: part.text })
  }

  const plainText = message.content.trim().length > 0
    ? message.content
    : message.parts.flatMap((part) => (part.kind === "text" ? [part.text] : [])).join("\n")

  return (
    <article
      className={`studio-message ${isUser ? "studio-message-user" : "studio-message-assistant"}`}
      data-message-id={message.id}
      data-pending={pending ? "true" : undefined}
      aria-label={isUser ? t.message.you : t.message.assistant}
    >
      <header className="studio-message-head">
        <span className="studio-message-role">{isUser ? t.message.you : t.message.assistant}</span>
        {!isUser && plainText.trim().length > 0 && <CopyButton locale={locale} text={plainText} />}
      </header>
      <div className="studio-message-parts">
        {isUser ? <p className="studio-message-text" dir="auto">{message.content}</p> : prose}
        {evidence.map((refs, index) => (
          <StudioEvidenceChips key={`evidence-${index}`} locale={locale} title={t.message.evidence} refs={refs} />
        ))}
        {citations.length > 0 && (
          <section className="studio-citations" aria-label={t.message.documents}>
            <p className="studio-citations-label">{t.message.documents}</p>
            <ul>
              {citations.flatMap((citation) => citation.refs).map((ref) => (
                <li key={ref.documentVersionId}>{ref.title}{ref.truncated ? " …" : ""}</li>
              ))}
            </ul>
          </section>
        )}
        {artifacts.map((artifact, index) => (
          <StudioArtifactCard
            key={`artifact-${artifact.actionId}-${index}`}
            locale={locale}
            workspaceSlug={workspaceSlug}
            locationSlug={locationSlug}
            part={artifact}
            canSave={canSaveVersions}
          />
        ))}
        {nextSteps}
        {warnings.length > 0 && (
          <section className="studio-warnings" aria-label={t.message.warnings}>
            <p className="studio-warnings-label"><TriangleAlert aria-hidden="true" /> {t.message.warnings}</p>
            <ul>
              {warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warning.text}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  )
}
