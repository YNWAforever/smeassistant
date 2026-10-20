import { Check, CircleAlert, CircleDashed, Loader2, X, type LucideIcon } from "lucide-react"

import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { ProviderStateName } from "@/lib/domain-labels"

export const PROVIDER_STATE_ICONS: Record<ProviderStateName, LucideIcon> = {
  measured: Check,
  pending: Loader2,
  unavailable: CircleDashed,
  unsupported: X,
  failed: CircleAlert,
}

export function formatObservedDate(iso: string | null, locale: PrototypeLocale, timeZone = "Asia/Hong_Kong"): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, { timeZone, year: "numeric", month: "short", day: "numeric" }).format(date)
}

/**
 * Source + state + observed date for one piece of evidence (guardrail 1:
 * evidence before score). A missing date is said, never invented.
 */
export function EvidenceBadge({
  source,
  state,
  observedAt,
  locale,
  timeZone,
}: {
  source: string
  state: ProviderStateName
  observedAt: string | null
  locale: PrototypeLocale
  timeZone?: string
}) {
  const t = copy[locale].ui
  const Icon = PROVIDER_STATE_ICONS[state]
  const date = formatObservedDate(observedAt, locale, timeZone)
  return (
    <span className={`provider-${state} inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full border px-2.5 py-1 text-xs`} data-state={state}>
      <Icon aria-hidden="true" className={`size-3.5 shrink-0${state === "pending" ? " motion-safe:animate-spin" : ""}`} />
      <span className="font-semibold">{source}</span>
      <span>{t.providerStates[state]}</span>
      <span className="text-ink-3">{date ? fill(t.evidence.observed, { date }) : t.evidence.dateUnknown}</span>
    </span>
  )
}
