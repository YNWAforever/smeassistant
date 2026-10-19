import { ArrowRight, Clock3 } from "lucide-react"
import Link from "next/link"

import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { FactTypeName } from "@/lib/domain-labels"

import { FactTypeBadge } from "./fact-type-badge"

type Level = "low" | "medium" | "high"

function Pips({ level, label }: { level: Level; label: string }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-ink-3">{label}</span>
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((i) => <span key={i} className={`size-1.5 rounded-full ${i <= filled ? "bg-brand-text" : "bg-line"}`} />)}
      </span>
    </span>
  )
}

/** One action in outcome language: what, how much it matters, how long, why we think so. */
export function ActionCard({
  title,
  summary,
  impact,
  effort,
  minutes,
  factType,
  status,
  href,
  locale,
}: {
  title: string
  summary?: string
  impact: Level
  effort: Level
  minutes: number
  factType: FactTypeName
  status?: string
  href: string
  locale: PrototypeLocale
}) {
  const t = copy[locale].ui.action
  return (
    <article className="kinnso-card grid gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <FactTypeBadge type={factType} locale={locale} />
        {status && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs font-semibold text-ink-2">{status}</span>}
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {summary && <p className="line-clamp-2 text-sm text-ink-2">{summary}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span><span className="sr-only">{t.impact}: </span><Pips level={impact} label={t.impact} /><span className="sr-only"> {t.levels[impact]}</span></span>
        <span><span className="sr-only">{t.effort}: </span><Pips level={effort} label={t.effort} /><span className="sr-only"> {t.levels[effort]}</span></span>
        <span className="inline-flex items-center gap-1 text-ink-2"><Clock3 aria-hidden="true" className="size-3.5" />{fill(t.minutes, { n: minutes })}</span>
      </div>
      <Link href={href} className="kinnso-link inline-flex min-h-11 items-center gap-1 justify-self-start font-semibold text-brand-text">
        {t.open} <span className="sr-only">: {title}</span><ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </article>
  )
}
