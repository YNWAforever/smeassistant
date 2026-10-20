import { Eye, Gauge, GitCompare, ListChecks, Search, ShieldCheck, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react"

import { DataTable } from "@/components/kinnso/data-table"
import { PublicPageFrame } from "@/components/product-ui"
import { CoverageMeter } from "@/components/visual/coverage-meter"
import { FactTypeLegend } from "@/components/visual/fact-type"
import { ScoreDial } from "@/components/visual/score-dial"
import { TrendChip } from "@/components/visual/trend"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { sourceKeys } from "@/lib/copy-public"
import { interpolate } from "@/lib/share"
import type { ScoreResult } from "@sme-scanner/scoring"

/** Pinned to the scorer both apps run (CLAUDE.md guardrail 16); a bump upstream breaks this line. */
const SCORING_VERSION: ScoreResult["scoringVersion"] = "2026-08-16"

const PRINCIPLE_ICONS: LucideIcon[] = [Eye, Gauge, GitCompare]
const STEP_ICONS: LucideIcon[] = [Search, ListChecks, Sparkles, ShieldCheck]

/**
 * How the product measures, explained with the same visuals the report uses:
 * a coverage meter with a missing source, a withheld score, comparable and
 * non-comparable change, and the six fact labels. Example values are
 * illustrative and labelled as such by the surrounding copy.
 */
export function MethodologyPage({ locale }: { locale: PrototypeLocale }) {
  const c = copy[locale]
  const t = c.siteInfo.methodology
  const sources = sourceKeys.map((key) => ({ key, label: c.site.sources.items[key].name, state: key === "instagram" ? "unavailable" as const : "measured" as const }))
  return (
    <PublicPageFrame locale={locale}>
      <main className="pl-page">
        <header className="pl-section pl-intro">
          <span className="pl-chip">{interpolate(c.funnel.methodology.versionBadge, { version: SCORING_VERSION })}</span>
          <h1 className="pl-title">{t.title}</h1>
          <p className="pl-lead">{t.lead}</p>
        </header>

        <section className="pl-section" aria-label={t.title}>
          <ol className="pl-steps">
            {t.principles.map((item, index) => {
              const Icon = PRINCIPLE_ICONS[index] ?? Eye
              return (
                <li key={item.title} className="pl-step">
                  <span className="pl-step-icon" aria-hidden="true"><Icon /></span>
                  <h2 className="pl-card-title">{item.title}</h2>
                  <p>{item.body}</p>
                </li>
              )
            })}
          </ol>
        </section>

        <section id="coverage" className="pl-section" aria-labelledby="pl-coverage-title">
          <h2 id="pl-coverage-title" className="pl-heading">{t.coverage.title}</h2>
          <p className="pl-body">{t.coverage.body}</p>
          <div className="pl-split">
            <div className="pl-panel grid gap-4">
              <p className="pl-formula">{t.coverage.formula}</p>
              <CoverageMeter sources={sources} locale={locale} />
            </div>
            <div className="pl-panel pl-dials">
              <ScoreDial score={62} coverage={80} locale={locale} size={112} />
              <ScoreDial score={null} coverage={20} locale={locale} size={112} />
            </div>
          </div>
        </section>

        <section className="pl-section" aria-labelledby="pl-comparable-title">
          <h2 id="pl-comparable-title" className="pl-heading">{t.comparable.title}</h2>
          <p className="pl-body">{t.comparable.body}</p>
          <div className="pl-panel pl-trends">
            <TrendChip delta={4} comparable locale={locale} />
            <TrendChip delta={6} comparable={false} reason="SCORING_VERSION_MISMATCH" locale={locale} />
            <TrendChip delta={null} comparable={false} reason="NO_SHARED_MEASURED_MODULE" locale={locale} />
          </div>
        </section>

        <section className="pl-section" aria-labelledby="pl-labels-title">
          <h2 id="pl-labels-title" className="pl-heading">{t.labels.title}</h2>
          <div className="pl-panel"><FactTypeLegend locale={locale} /></div>
        </section>

        <section className="pl-section" aria-labelledby="pl-surfaces-title">
          <h2 id="pl-surfaces-title" className="pl-heading">{t.surfaces.title}</h2>
          <ul className="pl-list">
            {t.surfaces.items.map((item, index) => (
              <li key={item.name} className="pl-list-item" data-claimed={index < 3 ? "true" : "false"}>
                <span className={index < 3 ? "pl-chip pl-chip-brand" : "pl-chip"}>{item.badge}</span>
                <strong>{item.name}</strong>
                <small>{item.body}</small>
              </li>
            ))}
          </ul>
        </section>

        <section className="pl-section" aria-labelledby="pl-work-title">
          <h2 id="pl-work-title" className="pl-heading">{t.work.title}</h2>
          <p className="pl-body">{t.work.lead}</p>
          <ol className="pl-steps pl-steps-4">
            {t.work.steps.map((step, index) => {
              const Icon = STEP_ICONS[index] ?? Search
              return (
                <li key={step.title} className="pl-step">
                  <span className="pl-step-icon" aria-hidden="true"><Icon /></span>
                  <span className="pl-step-num" aria-hidden="true">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="pl-section" aria-labelledby="pl-compare-title">
          <h2 id="pl-compare-title" className="pl-heading">{t.compare.title}</h2>
          <p className="pl-body">{t.compare.lead}</p>
          <div className="pl-panel pl-table">
            <DataTable
              caption={t.compare.caption}
              locale={locale}
              rowKey={(row) => row[0] ?? ""}
              rows={t.compare.rows}
              columns={t.compare.headers.map((header, index) => ({ key: String(index), header, cell: (row: string[]) => index === 0 ? <strong>{row[0]}</strong> : row[index] }))}
            />
          </div>
        </section>

        <aside className="pl-limits" aria-labelledby="pl-limits-title">
          <TriangleAlert aria-hidden="true" />
          <div>
            <h2 id="pl-limits-title">{t.limits.title}</h2>
            <p>{t.limits.body}</p>
          </div>
        </aside>
      </main>
    </PublicPageFrame>
  )
}
