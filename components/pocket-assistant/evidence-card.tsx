import { CalendarClock, Database, MapPin } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { EvidenceReference } from "@/lib/pocket-assistant/contracts"
import { evidenceValueLabel, sourceLabel } from "@/lib/workspace/source-label"

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Live scan ids are job uuids; owners read them as SCAN-XXXXXX (CLAUDE.md §5 Scanning). Demo ids pass through. */
function scanReference(scanId: string): string {
  return /^[0-9a-f]{8}-/i.test(scanId) ? `SCAN-${scanId.slice(0, 6).toUpperCase()}` : scanId
}

/**
 * Live observedAt arrives as PostgreSQL text ("2026-10-10 12:55:58.195+00"),
 * demo as ISO with +08:00. Both are shown as Hong Kong/Taipei wall time (both UTC+8).
 */
function observedText(observedAt: string, locale: string): string {
  const iso = observedAt.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return observedAt
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong" }).format(time)
}

export function AssistantEvidenceCard({ evidence, locale }: { evidence: EvidenceReference; locale: PrototypeLocale }) {
  const t = copy[locale].assistantSheet.evidenceCard
  return (
    <article className="assistant-evidence-card">
      <div className="assistant-evidence-head">
        <Badge variant="outline">{fill(t.factBadge, { type: evidence.factType })}</Badge>
        <code>{scanReference(evidence.scanId)}</code>
      </div>
      <strong>{evidence.label}</strong>
      <span className="assistant-evidence-value">{evidenceValueLabel(evidence.value, locale)}</span>
      <dl>
        <div><dt><MapPin aria-hidden="true" />{t.source}</dt><dd>{sourceLabel(evidence.source, locale)}</dd></div>
        <div><dt><CalendarClock aria-hidden="true" />{t.observedAt}</dt><dd>{observedText(evidence.observedAt, locale)}</dd></div>
        <div><dt><Database aria-hidden="true" />{t.evidence}</dt><dd>{evidence.evidenceId.replace(UUID, (id) => id.slice(0, 8))}</dd></div>
      </dl>
    </article>
  )
}
