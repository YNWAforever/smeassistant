import { copy, type PrototypeLocale } from "@/lib/copy"

/** Which of 改稿 → 確認 → 發出 the owner is on. A saved draft waits at 確認; an approved version is 發出. */
export function ownerStepIndex(input: { isApprovedCurrent: boolean; dirty: boolean; approval: string | null; hasVersion: boolean }): 0 | 1 | 2 {
  if (input.isApprovedCurrent) return 2
  if (input.hasVersion && !input.dirty && input.approval === "draft") return 1
  return 0
}

export function OwnerSteps({ locale, index }: { locale: PrototypeLocale; index: 0 | 1 | 2 }) {
  const steps = copy[locale].action.ownerSteps
  const labels = [steps.edit, steps.confirm, steps.send]
  return (
    <ol className="owner-steps" aria-label={steps.aria} data-testid="owner-steps">
      {labels.map((label, i) => (
        <li key={label} className={i === index ? "is-current" : i < index ? "is-done" : undefined} aria-current={i === index ? "step" : undefined}>
          {i > 0 && <span className="owner-steps-arrow" aria-hidden="true">→</span>}
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  )
}
