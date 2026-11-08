import { Camera, Globe, ListChecks, MapPin, Search, ShieldCheck, Sparkles, TrendingUp, type LucideIcon } from "lucide-react"
import Link from "next/link"
import type { CSSProperties } from "react"

import { ActionCard } from "@/components/kinnso/action-card"
import { formatObservedDate } from "@/components/kinnso/evidence-badge"
import { DemoBadge } from "@/components/product/badges"
import { CoverageMeter } from "@/components/visual/coverage-meter"
import { ScoreDial } from "@/components/visual/score-dial"
import { TrendChip } from "@/components/visual/trend"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { sourceKeys, type SourceKey } from "@/lib/copy-public"
import { fill } from "@/lib/copy-ui"
import { comparableScans, locations } from "@/lib/demo-data"
import type { ProviderStateName } from "@/lib/domain-labels"

const SOURCE_ICONS: Record<SourceKey, LucideIcon> = { search: Search, maps: MapPin, ai: Sparkles, instagram: Camera, website: Globe }
const STEP_ICONS: LucideIcon[] = [Search, ListChecks, TrendingUp]

/** Scan → Decide → Prove: three icons and one line each. */
export function HowItWorks({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].site.how
  return (
    <section id="how-it-works" className="pl-section" aria-labelledby="pl-how-title">
      <h2 id="pl-how-title" className="pl-heading">{t.title}</h2>
      <ol className="pl-steps">
        {t.steps.map((step, index) => {
          const Icon = STEP_ICONS[index] ?? Search
          return (
            <li key={step.title} className="pl-step" style={{ "--i": index } as CSSProperties}>
              <span className="pl-step-icon" aria-hidden="true"><Icon /></span>
              <span className="pl-step-num" aria-hidden="true">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** The five public sources, each with one line. Coverage, never zero, for a missing one. */
export function WhatWeCheck({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].site.sources
  return (
    <section className="pl-section" aria-labelledby="pl-sources-title">
      <h2 id="pl-sources-title" className="pl-heading">{t.title}</h2>
      <ul className="pl-sources">
        {sourceKeys.map((key) => {
          const Icon = SOURCE_ICONS[key]
          return (
            <li key={key} className="pl-source">
              <span className="pl-source-icon" aria-hidden="true"><Icon /></span>
              <span><strong>{t.items[key].name}</strong><small>{t.items[key].body}</small></span>
            </li>
          )
        })}
      </ul>
      <p className="pl-aside">{t.lead} <Link href={`/${locale}/methodology#coverage`} className="pl-link">{t.rules}</Link></p>
    </section>
  )
}

/**
 * The fixed Kam Man House demo (lib/demo-data.ts, guardrail 12), labelled
 * Demo and built from the same components the real report uses. Values come
 * from the demo data so the landing, sample report and demo workspace agree:
 * the latest comparable scan (25 Aug) against the earlier one (1 Aug).
 */
const SAMPLE_STATES: Record<SourceKey, ProviderStateName> = { search: "measured", maps: "measured", ai: "measured", instagram: "unavailable", website: "measured" }
const SAMPLE_OBSERVED = "2026-08-25T01:42:00Z"

export function SampleReportTeaser({ locale }: { locale: PrototypeLocale }) {
  const site = copy[locale].site
  const ui = copy[locale].ui
  const latest = locations[0]
  const [first, , last] = comparableScans
  const delta = last.score !== null && first.score !== null ? last.score - first.score : null
  const date = formatObservedDate(SAMPLE_OBSERVED, locale) ?? ""
  return (
    <section className="pl-section pl-sample" aria-labelledby="pl-sample-title">
      <div className="pl-sample-head">
        <p className="pl-eyebrow"><DemoBadge locale={locale} /><span>{site.sample.eyebrow}</span></p>
        <h2 id="pl-sample-title" className="pl-heading">{site.sample.title}</h2>
        <p className="pl-body">{site.sample.body}</p>
      </div>
      <div className="pl-sample-grid">
        <div className="pl-panel grid gap-4">
          <ScoreDial score={latest.score} coverage={latest.coverage} locale={locale} />
          <div className="grid gap-1">
            <TrendChip delta={delta} comparable={first.comparable && last.comparable} locale={locale} />
            <span className="text-xs text-ink-3">{ui.stat.sinceComparable} · {fill(ui.evidence.observed, { date })}</span>
          </div>
          <CoverageMeter locale={locale} sources={sourceKeys.map((key) => ({ key, label: site.sources.items[key].name, state: SAMPLE_STATES[key] }))} />
        </div>
        <ActionCard
          title={site.sample.actionTitle}
          summary={site.sample.actionSummary}
          impact="high"
          effort="low"
          minutes={10}
          factType="Observed"
          status={site.sample.status}
          href={`/${locale}/sample-report`}
          locale={locale}
        />
      </div>
      <div className="pl-actions">
        <Link href={`/${locale}/sample-report`} className="pl-secondary">{site.sample.cta}</Link>
        <Link href={`/${locale}/demo-workspace`} className="pl-link">{site.sample.workspace}</Link>
      </div>
    </section>
  )
}

/** Short trust promises with a link to the full Trust page. */
export function TrustStrip({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].site.trust
  return (
    <section className="pl-trust" aria-label={t.link}>
      <ul>
        {[t.noAutoPost, t.youApprove, t.publicOnly].map((item) => (
          <li key={item}><ShieldCheck aria-hidden="true" />{item}</li>
        ))}
      </ul>
      <Link href={`/${locale}/trust`} className="pl-link">{t.link}</Link>
    </section>
  )
}
