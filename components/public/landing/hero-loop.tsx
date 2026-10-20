"use client"

import type { CSSProperties } from "react"

import { useInView } from "@/components/visual/motion"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { sourceKeys } from "@/lib/copy-public"

/**
 * An 8-second illustration of one scan: a search, five sources checked one by
 * one (one stays "not available", shown hollow, never as zero), the coverage
 * ring filling one segment per measured source, then one priority card. It
 * carries no numbers and no business, so it implies no result. The still
 * frame (reduced motion, no JS) is the finished state; the loop pauses off
 * screen. Motion lives in app/styles/public.css.
 */
const UNAVAILABLE = "instagram"

export function HeroLoop({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].site
  const [ref, inView] = useInView<HTMLDivElement>()
  const measured = sourceKeys.filter((key) => key !== UNAVAILABLE)
  const r = 34
  const circumference = 2 * Math.PI * r
  const segment = circumference / measured.length
  return (
    <div ref={ref} className="pl-loop" role="img" aria-label={t.hero.loopLabel} data-offscreen={inView ? undefined : ""}>
      <svg viewBox="0 0 320 300" className="block h-auto w-full" aria-hidden="true">
        <g className="pl-loop-search">
          <rect x="16" y="16" width="288" height="40" rx="20" className="pl-loop-field" />
          <circle cx="40" cy="36" r="7" className="pl-loop-stroke" />
          <line x1="45" y1="41" x2="50" y2="46" className="pl-loop-stroke" />
          <rect x="60" y="31" width="120" height="10" rx="5" className="pl-loop-typed" />
        </g>
        {sourceKeys.map((key, index) => {
          const y = 76 + index * 34
          const missing = key === UNAVAILABLE
          return (
            <g key={key} className="pl-loop-row" style={{ "--i": index } as CSSProperties}>
              <rect x="16" y={y} width="168" height="26" rx="8" className="pl-loop-rowbg" />
              <text x="28" y={y + 17} className="pl-loop-label">{t.sources.items[key].name}</text>
              {missing ? (
                <circle cx="166" cy={y + 13} r="7" className="pl-loop-missing" />
              ) : (
                <g className="pl-loop-tick">
                  <circle cx="166" cy={y + 13} r="8" className="pl-loop-ok" />
                  <path d={`M162 ${y + 13}l3 3 6-6`} className="pl-loop-check" />
                </g>
              )}
            </g>
          )
        })}
        <g transform="translate(250 140)">
          <circle r={r} className="pl-loop-track" />
          {measured.map((key, index) => (
            <circle
              key={key}
              r={r}
              className="pl-loop-arc"
              style={{ "--i": index } as CSSProperties}
              strokeDasharray={`${segment - 4} ${circumference}`}
              transform={`rotate(${-90 + (index * 360) / measured.length})`}
            />
          ))}
          <rect x="-14" y="-4" width="28" height="8" rx="4" className="pl-loop-typed" />
        </g>
        <g className="pl-loop-card">
          <rect x="200" y="214" width="104" height="70" rx="12" className="pl-loop-cardbg" />
          <rect x="212" y="228" width="40" height="8" rx="4" className="pl-loop-chip" />
          <rect x="212" y="244" width="80" height="8" rx="4" className="pl-loop-line" />
          <rect x="212" y="258" width="60" height="8" rx="4" className="pl-loop-line" />
        </g>
      </svg>
    </div>
  )
}
