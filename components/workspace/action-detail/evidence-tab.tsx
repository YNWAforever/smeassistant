import { FactType, SectionCard } from "@/components/product-ui"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { basisLabel, formatDateTime, metricLabel, numericOrNull, priorityLabel, signed, stateLabel } from "@/lib/workspace/format"
import type { ActionDetail } from "@/lib/workspace/queries-pages"
import { evidenceValueLabel, sourceLabel } from "@/lib/workspace/source-label"

/** The Evidence tab of an action: the observed fact, why the action exists, and any before/after measurement. */
export function EvidenceTab({ action, measurements, locale, timezone, locationName }: { action: ActionDetail["action"]; measurements: ActionDetail["measurements"]; locale: PrototypeLocale; timezone: string; locationName: string }) {
  const t = copy[locale].actionTabs.evidence
  return (
    <div className="evidence-detail-grid">
      <SectionCard><div className="section-card-heading"><div><p className="eyebrow">{t.observedFact}</p><h2>{sourceLabel(action.evidence.source, locale)}</h2></div><FactType type={action.evidence.factType} /></div><div className="evidence-big-value">{evidenceValueLabel(action.evidence.value, locale) || "—"}<span>{resolveText(action.evidence.detail, locale)}</span></div><dl className="evidence-detail-dl"><div><dt>{t.observed}</dt><dd>{formatDateTime(action.evidence.observedAt, locale, timezone)}</dd></div><div><dt>{t.location}</dt><dd>{locationName}</dd></div><div><dt>{t.freshness}</dt><dd>{resolveText(action.evidence.freshness, locale) || "—"}</dd></div><div><dt>{t.measurement}</dt><dd>{stateLabel(action.measurementState, locale)}</dd></div></dl></SectionCard>
      <SectionCard><p className="eyebrow">{t.interpretation}</p><h2>{t.why}</h2><div className="fact-stack"><div><FactType type={action.evidence.factType} /><p>{resolveText(action.evidence.detail, locale)}</p></div><div><FactType type="Inference" /><p>{action.priorityFactors.map((factor) => `${resolveText(factor.label, locale)} ${signed(factor.points)}`).join(" · ") || priorityLabel(action.priority, locale)}</p></div><div><FactType type="Recommended" /><p>{resolveText(action.title, locale)}</p></div><div><FactType type="Unknown" /><p>{t.unknown}</p></div></div></SectionCard>
      {measurements.length > 0 && <SectionCard><p className="eyebrow">{t.measurement}</p><h2>{t.beforeAfter}</h2><dl className="trust-dl">{measurements.map((m) => <div key={m.id}><dt>{metricLabel(m.metric_key, locale)} · <FactType type={m.fact_type} />{m.fact_type === "Attributed" ? <span> · {basisLabel(m.attribution_basis, locale)}</span> : null}</dt><dd>{m.before_value ?? "—"} → {m.after_value ?? "—"} ({signed(numericOrNull(m.delta), 1)})</dd></div>)}</dl></SectionCard>}
    </div>
  )
}
