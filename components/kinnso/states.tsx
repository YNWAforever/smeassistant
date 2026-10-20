"use client"

import { CircleDashed, RotateCcw } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { EmptyIllustration } from "@/components/visual/illustrations"
import { copy, type PrototypeLocale } from "@/lib/copy"

/**
 * The non-happy states every page needs (audit §g). Each has one
 * illustration from the shared set, one line of text and at most one next
 * step.
 */
function StateFrame({ tone, icon, title, body, action, live }: { tone: string; icon: ReactNode; title: string; body?: string; action?: ReactNode; live?: "polite" | "assertive" }) {
  return (
    <section className={`kinnso-state kinnso-state-${tone} grid justify-items-center gap-3 px-6 py-10 text-center`} role={live === "assertive" ? "alert" : live ? "status" : undefined}>
      <span className="kinnso-state-icon grid place-items-center" aria-hidden="true">{icon}</span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {body && <p className="max-w-md text-sm text-ink-2">{body}</p>}
      {action}
    </section>
  )
}

type EmptyKind = "noData" | "noActions" | "allDone"

/**
 * `kind` picks the illustration and default copy; `actionHref` adds the one
 * next-step button with that kind's label. Without a kind it is the generic
 * "Nothing here yet".
 */
export function EmptyState({ kind, title, body, action, actionHref, locale }: { kind?: EmptyKind; title?: string; body?: string; action?: ReactNode; actionHref?: string; locale: PrototypeLocale }) {
  const preset = kind ? copy[locale].ui.visual.empty[kind] : null
  const next = action ?? (preset && actionHref ? <Button asChild className="min-h-11"><Link href={actionHref}>{preset.action}</Link></Button> : undefined)
  return (
    <StateFrame
      tone={kind === "allDone" ? "done" : "empty"}
      icon={<EmptyIllustration kind={kind ?? "noData"} />}
      title={title ?? preset?.title ?? copy[locale].ui.states.emptyTitle}
      body={body ?? preset?.body}
      action={next}
    />
  )
}

export function ErrorState({ onRetry, body, locale }: { onRetry?: () => void; body?: string; locale: PrototypeLocale }) {
  const t = copy[locale].ui.states
  return (
    <StateFrame
      tone="error"
      live="assertive"
      icon={<EmptyIllustration kind="error" />}
      title={t.errorTitle}
      body={body ?? t.errorBody}
      action={onRetry && <Button onClick={onRetry} className="min-h-11"><RotateCcw aria-hidden="true" />{t.retry}</Button>}
    />
  )
}

export function PartialDataState({ body, action, locale }: { body?: string; action?: ReactNode; locale: PrototypeLocale }) {
  const t = copy[locale].ui.states
  return <StateFrame tone="partial" live="polite" icon={<span className="grid size-14 place-items-center rounded-full"><CircleDashed className="size-6" /></span>} title={t.partialTitle} body={body ?? t.partialBody} action={action} />
}

export function PermissionDenied({ body, locale }: { body?: string; locale: PrototypeLocale }) {
  const t = copy[locale].ui.states
  return <StateFrame tone="denied" live="polite" icon={<EmptyIllustration kind="denied" />} title={t.deniedTitle} body={body ?? t.deniedBody} />
}
