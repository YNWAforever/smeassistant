import { FactType, SectionCard } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { basisLabel, formatDateTime, metricLabel, numericOrNull, priorityLabel, signed, stateLabel } from "@/lib/workspace/format"
import type { ActionDetail } from "@/lib/workspace/queries-pages"
import { evidenceValueLabel, sourceLabel } from "@/lib/workspace/source-label"
import { zhFor } from "@/lib/zh-tw"

/** The Evidence tab of an action: the observed fact, why the action exists, and any before/after measurement. */
export function EvidenceTab({ action, measurements, locale, timezone, locationName }: { action: ActionDetail["action"]; measurements: ActionDetail["measurements"]; locale: PrototypeLocale; timezone: string; locationName: string }) {
  const isChinese = locale !== "en"
  return (
    <div className="evidence-detail-grid">
      <SectionCard><div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "已觀察事實" : "Observed fact"}</p><h2>{sourceLabel(action.evidence.source, locale)}</h2></div><FactType type={action.evidence.factType} /></div><div className="evidence-big-value">{evidenceValueLabel(action.evidence.value, locale) || "—"}<span>{resolveText(action.evidence.detail, locale)}</span></div><dl className="evidence-detail-dl"><div><dt>{isChinese ? "觀察時間" : "Observed"}</dt><dd>{formatDateTime(action.evidence.observedAt, locale, timezone)}</dd></div><div><dt>{isChinese ? zhFor(locale, "地點") : "Location"}</dt><dd>{locationName}</dd></div><div><dt>{isChinese ? "新鮮度" : "Freshness"}</dt><dd>{resolveText(action.evidence.freshness, locale) || "—"}</dd></div><div><dt>{isChinese ? zhFor(locale, "量度") : "Measurement"}</dt><dd>{stateLabel(action.measurementState, locale)}</dd></div></dl></SectionCard>
      <SectionCard><p className="eyebrow">{isChinese ? "解讀與限制" : "Interpretation and limitation"}</p><h2>{isChinese ? "為何建立此行動" : "Why this action exists"}</h2><div className="fact-stack"><div><FactType type={action.evidence.factType} /><p>{resolveText(action.evidence.detail, locale)}</p></div><div><FactType type="Inference" /><p>{action.priorityFactors.map((factor) => `${resolveText(factor.label, locale)} ${signed(factor.points)}`).join(" · ") || priorityLabel(action.priority, locale)}</p></div><div><FactType type="Recommended" /><p>{resolveText(action.title, locale)}</p></div><div><FactType type="Unknown" /><p>{isChinese ? zhFor(locale, "此行動沒有量度收入、預訂量或顧客意圖。") : "Revenue, reservations and customer intent are not measured by this action."}</p></div></div></SectionCard>
      {measurements.length > 0 && <SectionCard><p className="eyebrow">{isChinese ? zhFor(locale, "量度") : "Measurement"}</p><h2>{isChinese ? "行動前後" : "Before and after"}</h2><dl className="trust-dl">{measurements.map((m) => <div key={m.id}><dt>{metricLabel(m.metric_key, locale)} · <FactType type={m.fact_type} />{m.fact_type === "Attributed" ? <span> · {basisLabel(m.attribution_basis, locale)}</span> : null}</dt><dd>{m.before_value ?? "—"} → {m.after_value ?? "—"} ({signed(numericOrNull(m.delta), 1)})</dd></div>)}</dl></SectionCard>}
    </div>
  )
}
