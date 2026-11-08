import { FactType } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"
import type { EvidenceReference } from "@/lib/pocket-assistant/contracts"

/**
 * The evidence a Studio answer used: `source · observed date · fact type`.
 *
 * The chip carries no action. It is the server-authorised citation list for
 * this message, rendered read-only so the answer never looks more certain than
 * its evidence (guardrail 1 + 4). Dates are formatted in UTC so the server and
 * the browser produce the same string (no hydration drift).
 */
function evidenceDate(observedAt: string, locale: PrototypeLocale): string {
  const date = new Date(observedAt)
  if (Number.isNaN(date.getTime())) return observedAt
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date)
  } catch {
    return observedAt
  }
}

export function StudioEvidenceChips({
  locale,
  title,
  refs,
}: {
  locale: PrototypeLocale
  title: string
  refs: EvidenceReference[]
}) {
  if (refs.length === 0) return null
  return (
    <section className="studio-evidence" aria-label={title}>
      <p className="studio-evidence-label">{title}</p>
      <ul className="studio-evidence-list">
        {refs.map((ref) => (
          <li key={ref.evidenceId} className="studio-evidence-chip" title={`${ref.label}: ${ref.value}`}>
            <span className="studio-evidence-source">{ref.source}</span>
            <span className="studio-evidence-separator" aria-hidden="true">·</span>
            <span className="studio-evidence-date">{evidenceDate(ref.observedAt, locale)}</span>
            <FactType type={ref.factType} />
          </li>
        ))}
      </ul>
    </section>
  )
}
