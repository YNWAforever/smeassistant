import { editorStep } from "./owner-steps"
import { StepPrimary } from "./approval-panel"
import type { ActionEditor } from "./use-action-editor"

export function StickyApprovalBar({ ed }: { ed: ActionEditor }) {
  // Generation stays in the editor; the sticky bar repeats Save, Confirm or Copy.
  if (ed.checklistSteps || editorStep(ed) === 0 && !ed.dirty) return null
  return <div className="sticky-approval-bar"><span>{ed.effectiveRole === "viewer" ? ed.ac.sticky.viewer : ed.ac.sticky.note}</span><StepPrimary ed={ed} /></div>
}
