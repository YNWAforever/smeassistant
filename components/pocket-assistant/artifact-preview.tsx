import { Check, FileClock, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { AssistantArtifact } from "@/lib/pocket-assistant/contracts"

export function AssistantArtifactPreview({ artifact, isChinese }: { artifact: AssistantArtifact; isChinese: boolean }) {
  return (
    <section className="assistant-artifact-preview" aria-labelledby="assistant-artifact-title">
      <div className="assistant-artifact-head">
        <span><FileClock aria-hidden="true" /></span>
        <div>
          <small>{isChinese ? "可審批輸出預覽" : "Approval-ready output preview"}</small>
          <h3 id="assistant-artifact-title">{artifact.title}</h3>
        </div>
        <Badge variant="outline">v{artifact.version}</Badge>
      </div>
      <p className="assistant-artifact-body">{artifact.body}</p>
      <div className="assistant-criteria">
        <strong><ShieldCheck aria-hidden="true" />{isChinese ? "核准條件" : "Acceptance criteria"}</strong>
        <ul>{artifact.acceptanceCriteria.map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}</ul>
      </div>
    </section>
  )
}
