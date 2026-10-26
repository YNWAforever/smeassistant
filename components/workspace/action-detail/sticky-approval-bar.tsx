import { StepPrimary } from "./approval-panel"
import type { ActionEditor } from "./use-action-editor"

export function StickyApprovalBar({ ed }: { ed: ActionEditor }) {
  if (ed.checklistSteps) return null
  return <div className="sticky-approval-bar"><span>{ed.effectiveRole === "viewer" ? ed.ac.sticky.viewer : ed.ac.sticky.note}</span><StepPrimary ed={ed} /></div>
}
