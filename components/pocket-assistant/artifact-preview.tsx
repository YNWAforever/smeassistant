import { Check, FileClock, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { AssistantArtifact } from "@/lib/pocket-assistant/contracts"

export function AssistantArtifactPreview({ artifact, locale }: { artifact: AssistantArtifact; locale: PrototypeLocale }) {
  const t = copy[locale].assistantSheet.artifact
  return (
    <section className="assistant-artifact-preview" aria-labelledby="assistant-artifact-title">
      <div className="assistant-artifact-head">
        <span><FileClock aria-hidden="true" /></span>
        <div>
          <small>{t.eyebrow}</small>
          <h3 id="assistant-artifact-title">{artifact.title}</h3>
        </div>
        <Badge variant="outline">{t.badge}</Badge>
      </div>
      <p className="assistant-artifact-body">{artifact.body}</p>
      <div className="assistant-criteria">
        <strong><ShieldCheck aria-hidden="true" />{t.criteria}</strong>
        <ul>{artifact.acceptanceCriteria.map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}</ul>
      </div>
    </section>
  )
}
