"use client"

import { Check, LockKeyhole } from "lucide-react"
import type { CSSProperties } from "react"

import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import { approvalFlowSteps, loopSteps, type ApprovalFlowStep, type LoopStep } from "@/lib/copy-visual"

import { useReveal } from "./motion"

type Step = { key: string; label: string; lockBefore?: boolean }

/**
 * Shared track for the stepper visuals: numbered nodes on a line that fills
 * up to the current step. The fill grows by scaleX (no layout change); below
 * the fold the nodes and fill play once on arrival.
 */
function StepTrack({ steps, current, label, locale, className }: { steps: Step[]; current: number; label: string; locale: PrototypeLocale; className?: string }) {
  const [ref, reveal] = useReveal<HTMLDivElement>()
  const stepOf = copy[locale].ui.visual.loop.stepOf
  const progress = steps.length > 1 ? current / (steps.length - 1) : 1
  return (
    <div ref={ref} role="group" aria-label={label} className={`k-steps ${className ?? ""}`} data-reveal-state={reveal} style={{ "--count": steps.length } as CSSProperties}>
      <div className="k-steps-track" aria-hidden="true">
        <span className={`k-progress-bar k-steps-fill${reveal === "in" ? " k-progress-fill" : ""}`} style={{ "--progress": progress } as CSSProperties} />
      </div>
      <ol className="k-steps-list" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const status = index < current ? "done" : index === current ? "current" : "upcoming"
          return (
            <li key={step.key} className="k-step k-reveal" data-status={status} aria-current={status === "current" ? "step" : undefined} style={{ "--i": index } as CSSProperties}>
              <span className="k-step-node" aria-hidden="true">
                {status === "done" ? <Check className="size-4" /> : index + 1}
              </span>
              {step.lockBefore && <LockKeyhole aria-hidden="true" className="k-step-lock size-3.5" />}
              <span className="k-step-label">{step.label}</span>
              {status === "current" && <span className="sr-only">{fill(stepOf, { n: index + 1, total: steps.length })}</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Scan → Decide → Approve → Deliver → Prove: where the owner is in the loop. */
export function LoopStepper({ current, locale }: { current: LoopStep; locale: PrototypeLocale }) {
  const t = copy[locale].ui.visual.loop
  return <StepTrack locale={locale} label={t.label} current={loopSteps.indexOf(current)} steps={loopSteps.map((key) => ({ key, label: t.steps[key] }))} />
}

/**
 * Draft → Needs approval → Approved → Delivered, with a lock before
 * "Approved": nothing goes out until a person approves one version
 * (guardrails 5 and 6).
 */
export function ApprovalFlow({ state, locale }: { state: ApprovalFlowStep; locale: PrototypeLocale }) {
  const t = copy[locale].ui.visual.approvalFlow
  return (
    <figure className="k-approval-flow grid gap-2">
      <StepTrack
        locale={locale}
        label={t.label}
        current={approvalFlowSteps.indexOf(state)}
        steps={approvalFlowSteps.map((key) => ({ key, label: t.steps[key], lockBefore: key === "approved" }))}
      />
      <figcaption className="inline-flex items-center gap-1.5 text-xs text-ink-2">
        <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0 text-brand-text" />
        {t.lock}
      </figcaption>
    </figure>
  )
}
