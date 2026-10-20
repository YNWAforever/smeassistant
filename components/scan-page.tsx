"use client"

import Link from "next/link"
import { ArrowRight, Check, ChevronLeft, CircleAlert, ShieldCheck } from "lucide-react"

import { PublicPageFrame } from "@/components/product-ui"
import { StepBusiness } from "@/components/public/scan/step-business"
import { StepDetails } from "@/components/public/scan/step-details"
import { StepLinks } from "@/components/public/scan/step-links"
import { StepReview } from "@/components/public/scan/step-review"
import { useScanWizard, type ScanWizardProps } from "@/components/public/scan/use-scan-wizard"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { interpolate } from "@/lib/share"

/**
 * The four-step scan form. State, search and submission live in
 * useScanWizard; each step renders from components/public/scan/*.
 */
export function ScanPage(props: ScanWizardProps) {
  const { locale } = props
  const w = useScanWizard(props)
  const { hydrated, c, step, setStep, error, submitting, next, errorBanner, stepHeading } = w

  return (
    <PublicPageFrame locale={locale}>
      <main className="flow-page">
        <Link className="back-link" href={`/${locale}`}>
          <ChevronLeft /> {c.backHome}
        </Link>
        <div className="flow-layout">
          <aside className="flow-steps" aria-label={c.eyebrow}>
            <p className="eyebrow">{c.eyebrow}</p>
            <ol>
              {c.stepTitles.map((label, index) => (
                <li key={label} className={step === index + 1 ? "is-active" : step > index + 1 ? "is-complete" : ""}>
                  <span>{step > index + 1 ? <Check /> : index + 1}</span>
                  <div>
                    <strong>{label}</strong>
                    <small>{c.stepHints[index]}</small>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flow-security">
              <ShieldCheck />
              <div>
                <strong>{c.securityTitle}</strong>
                <p>{c.securityBody}</p>
              </div>
            </div>
          </aside>
          <section className="flow-card" aria-live="polite">
            <div className="flow-card-header">
              <div>
                <span>{interpolate(c.stepOf, { step })}</span>
                <h1 ref={stepHeading} tabIndex={-1}>{c.stepTitles[step - 1]}</h1>
              </div>
            </div>
            <Progress value={step * 25} aria-label={interpolate(c.progressLabel, { percent: step * 25 })} />
            {error && (
              <div className="form-error" role="alert" tabIndex={-1} ref={errorBanner}>
                <CircleAlert /> {error}
              </div>
            )}

            {step === 1 && <StepBusiness w={w} locale={locale} />}

            {step === 2 && <StepDetails w={w} locale={locale} />}

            {step === 3 && <StepLinks w={w} />}

            {step === 4 && <StepReview w={w} locale={locale} />}

            <div className="flow-card-footer">
              <Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={!hydrated || step === 1 || submitting}>
                <ChevronLeft /> {c.back}
              </Button>
              <Button onClick={next} disabled={!hydrated || submitting}>
                {step === 4 ? (submitting ? c.submitting : c.start) : c.continue}
                <ArrowRight />
              </Button>
            </div>
          </section>
        </div>
      </main>
    </PublicPageFrame>
  )
}
