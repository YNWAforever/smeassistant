"use client"

import { usePathname } from "next/navigation"
import { Check } from "lucide-react"
import { normaliseLocale } from "@/lib/copy"
import { zhFor } from "@/lib/zh-tw"

export function ScoreDial({ score, coverage, delta }: { score: number; coverage: number | null; delta?: number }) {
  const pathname = usePathname()
  const locale = normaliseLocale(pathname.split("/").filter(Boolean)[0])
  const isChinese = locale !== "en"
  return (
    <div className="score-dial-wrap">
      <div
        className="score-dial"
        style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}
        role="img"
        aria-label={isChinese ? `能見度評分 ${score} 分（滿分 100）。${coverage == null ? "" : `覆蓋率 ${coverage}%。`}${typeof delta === "number" ? `可比較變化 ${delta}。` : ""}` : `Visibility score ${score} out of 100.${coverage == null ? "" : ` Coverage ${coverage} percent.`}${typeof delta === "number" ? ` Change ${delta}.` : ""}`}
      >
        <div className="score-dial-core">
          <span className="score-number">{score}</span>
          <span className="score-label">/ 100</span>
        </div>
      </div>
      <div className="score-dial-meta">
        {coverage != null && <strong>{coverage}% {isChinese ? zhFor(locale, "覆蓋率") : "coverage"}</strong>}
        {typeof delta === "number" && (
          <span className={delta < 0 ? "delta-down" : "delta-up"}>
            {delta > 0 ? "+" : ""}{delta} {isChinese ? "（自上次可比較掃描）" : "since comparable scan"}
          </span>
        )}
      </div>
    </div>
  )
}

export const loopSteps = ["Discover", "Diagnose", "Prioritise", "Draft", "Approve", "Export", "Re-scan", "Prove change"]
export const loopStepsZh = ["發現", "診斷", "排序", "擬稿", "審批", "匯出／發佈", "重新掃描", "證明改善"]

export function LoopRibbon({ active = 0 }: { active?: number }) {
  const pathname = usePathname()
  const locale = normaliseLocale(pathname.split("/").filter(Boolean)[0])
  const steps = locale === "en" ? loopSteps : loopStepsZh
  return (
    // Scrolls sideways on phones, so keyboard users need to be able to focus it (WCAG 2.1.1).
    <ol className="loop-ribbon" tabIndex={0} aria-label={locale === "en" ? "Visibility improvement loop" : "能見度改善循環"}>
      {steps.map((step, index) => (
        <li key={step} className={index === active ? "is-active" : index < active ? "is-done" : ""}>
          <span className="loop-index">{index < active ? <Check aria-hidden="true" /> : index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}
