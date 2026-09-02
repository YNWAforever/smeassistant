import { CalendarClock, Database, MapPin } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { EvidenceReference } from "@/lib/pocket-assistant/contracts"

export function AssistantEvidenceCard({ evidence, isChinese }: { evidence: EvidenceReference; isChinese: boolean }) {
  return (
    <article className="assistant-evidence-card">
      <div className="assistant-evidence-head">
        <Badge variant="outline">{isChinese ? "已觀察" : evidence.factType}</Badge>
        <code>{evidence.scanId}</code>
      </div>
      <strong>{evidence.label}</strong>
      <span className="assistant-evidence-value">{evidence.value}</span>
      <dl>
        <div><dt><MapPin aria-hidden="true" />{isChinese ? "來源" : "Source"}</dt><dd>{evidence.source}</dd></div>
        <div><dt><CalendarClock aria-hidden="true" />{isChinese ? "觀察時間" : "Observed"}</dt><dd>{evidence.observedAt.replace("T", " · ").replace("+08:00", " HKT")}</dd></div>
        <div><dt><Database aria-hidden="true" />{isChinese ? "證據" : "Evidence"}</dt><dd>{evidence.evidenceId}</dd></div>
      </dl>
    </article>
  )
}
