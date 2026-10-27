import { Lock } from "lucide-react"

import { copy, type PrototypeLocale } from "@/lib/copy"

/** Which of 改稿 → 確認 → 複製文字 the owner is on. A saved draft waits at 確認; an approved version is 複製文字. */
export function ownerStepIndex(input: { isApprovedCurrent: boolean; dirty: boolean; approval: string | null; hasVersion: boolean; editing?: boolean }): 0 | 1 | 2 {
  if (input.editing) return 0
  if (input.isApprovedCurrent) return 2
  if (input.hasVersion && !input.dirty && input.approval === "draft") return 1
  return 0
}

export function OwnerSteps({ locale, index }: { locale: PrototypeLocale; index: 0 | 1 | 2 }) {
  const steps = copy[locale].action.ownerSteps
  const labels = [steps.edit, steps.confirm, steps.send]
  return (
    <div className="owner-steps-wrap">
    <ol className="owner-steps" aria-label={steps.aria} data-testid="owner-steps">
      {labels.map((label, i) => (
        <li key={label} className={i === index ? "is-current" : i < index ? "is-done" : undefined} aria-current={i === index ? "step" : undefined}>
          {i > 0 && <span className="owner-steps-arrow" aria-hidden="true">→</span>}
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
    <p className="owner-steps-lock"><Lock aria-hidden="true" />{copy[locale].ui.visual.approvalFlow.lock}</p>
    </div>
  )
}

/** Local editing belongs to one immutable version; a newly saved version returns to Confirm. */
export function editorStep(ed: { isApprovedCurrent: boolean; dirty: boolean; approval: string | null; selectedVersion: { id: string } | null; editingVersionId: string | null }): 0 | 1 | 2 {
  return ownerStepIndex({ ...ed, hasVersion: ed.selectedVersion != null, editing: ed.selectedVersion != null && ed.editingVersionId === ed.selectedVersion.id })
}
