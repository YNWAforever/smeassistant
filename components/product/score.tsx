"use client"

import { usePathname } from "next/navigation"
import { Check } from "lucide-react"
import { copy, normaliseLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"

export function ScoreDial({ score, coverage, delta }: { score: number; coverage: number | null; delta?: number }) {
  const pathname = usePathname()
  const locale = normaliseLocale(pathname.split("/").filter(Boolean)[0])
  const t = copy[locale].product.score
  const label = fill(t.aria, { score }) + (coverage == null ? "" : fill(t.ariaCoverage, { coverage })) + (typeof delta === "number" ? fill(t.ariaChange, { delta }) : "")
  return (
    <div className="score-dial-wrap">
      <div
        className="score-dial"
        style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}
        role="img"
        aria-label={label}
      >
        <div className="score-dial-core">
          <span className="score-number">{score}</span>
          <span className="score-label">/ 100</span>
        </div>
      </div>
      <div className="score-dial-meta">
        {coverage != null && <strong>{coverage}% {t.coverage}</strong>}
        {typeof delta === "number" && (
          <span className={delta < 0 ? "delta-down" : "delta-up"}>
            {delta > 0 ? "+" : ""}{delta} {t.sinceComparable}
          </span>
        )}
      </div>
    </div>
  )
}

export function LoopRibbon({ active = 0 }: { active?: number }) {
  const pathname = usePathname()
  const locale = normaliseLocale(pathname.split("/").filter(Boolean)[0])
  const t = copy[locale].product.loop
  const steps = t.steps
  return (
    // Scrolls sideways on phones, so keyboard users need to be able to focus it (WCAG 2.1.1).
    <ol className="loop-ribbon" tabIndex={0} aria-label={t.label}>
      {steps.map((step, index) => (
        <li key={step} className={index === active ? "is-active" : index < active ? "is-done" : ""}>
          <span className="loop-index">{index < active ? <Check aria-hidden="true" /> : index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}
