"use client"

import { CircleAlert, CircleDashed, Inbox, LockKeyhole, RotateCcw } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"

/**
 * The four non-happy states every page needs (audit §g). Each has one
 * illustration slot, one line of text and at most one next step.
 */
function StateFrame({ tone, icon, title, body, action, live }: { tone: string; icon: ReactNode; title: string; body?: string; action?: ReactNode; live?: "polite" | "assertive" }) {
  return (
    <section className={`kinnso-state kinnso-state-${tone} grid justify-items-center gap-3 px-6 py-10 text-center`} role={live === "assertive" ? "alert" : live ? "status" : undefined}>
      <span className="kinnso-state-icon grid size-14 place-items-center rounded-full" aria-hidden="true">{icon}</span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {body && <p className="max-w-md text-sm text-ink-2">{body}</p>}
      {action}
    </section>
  )
}

export function EmptyState({ title, body, action, illustration, locale }: { title?: string; body?: string; action?: ReactNode; illustration?: ReactNode; locale: PrototypeLocale }) {
  return <StateFrame tone="empty" icon={illustration ?? <Inbox className="size-6" />} title={title ?? copy[locale].ui.states.emptyTitle} body={body} action={action} />
}

export function ErrorState({ onRetry, body, locale }: { onRetry?: () => void; body?: string; locale: PrototypeLocale }) {
  const t = copy[locale].ui.states
  return (
    <StateFrame
      tone="error"
      live="assertive"
      icon={<CircleAlert className="size-6" />}
      title={t.errorTitle}
      body={body ?? t.errorBody}
      action={onRetry && <Button onClick={onRetry} className="min-h-11"><RotateCcw aria-hidden="true" />{t.retry}</Button>}
    />
  )
}

export function PartialDataState({ body, action, locale }: { body?: string; action?: ReactNode; locale: PrototypeLocale }) {
  const t = copy[locale].ui.states
  return <StateFrame tone="partial" live="polite" icon={<CircleDashed className="size-6" />} title={t.partialTitle} body={body ?? t.partialBody} action={action} />
}

export function PermissionDenied({ body, locale }: { body?: string; locale: PrototypeLocale }) {
  const t = copy[locale].ui.states
  return <StateFrame tone="denied" live="polite" icon={<LockKeyhole className="size-6" />} title={t.deniedTitle} body={body ?? t.deniedBody} />
}
