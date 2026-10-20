"use client"

import { CircleHelp } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"

/**
 * A "?" that answers one question in one sentence, with an optional short
 * SVG/CSS demo. The demo is paused until the pointer is over it or focus is
 * inside the popover, so nothing loops on its own; reduced motion shows the
 * demo's still frame.
 */
export function InlineExplainer({ label, answer, demo, locale }: { label: string; answer: string; demo?: ReactNode; locale: PrototypeLocale }) {
  const [playing, setPlaying] = useState(false)
  const question = fill(copy[locale].ui.visual.explainer.open, { label })
  return (
    <Popover onOpenChange={(open) => { if (!open) setPlaying(false) }}>
      <PopoverTrigger asChild>
        <button type="button" className="k-explainer-trigger inline-grid size-6 place-items-center rounded-full align-middle" aria-label={question}>
          <CircleHelp aria-hidden="true" className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="grid w-72 gap-3"
        onPointerEnter={() => setPlaying(true)}
        onPointerLeave={() => setPlaying(false)}
        onFocusCapture={() => setPlaying(true)}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPlaying(false) }}
      >
        <p className="text-sm font-semibold text-ink">{question}</p>
        <p className="text-sm text-ink-2">{answer}</p>
        {demo && (
          <div className="k-demo" data-playing={playing ? "" : undefined} aria-hidden="true">
            {demo}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * 8-second demo of the approval boundary: a draft waits at the lock, a person
 * approves, then it is delivered. Illustrative only: no data, no outcome.
 */
export function ApprovalDemo() {
  return (
    <svg viewBox="0 0 240 72" className="w-full" role="presentation">
      <line x1="20" y1="36" x2="220" y2="36" stroke="var(--line)" strokeWidth="2" strokeDasharray="4 4" />
      <g className="k-demo-lock">
        <rect x="108" y="22" width="24" height="20" rx="4" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="2" />
        <path d="M113 22v-5a7 7 0 0 1 14 0v5" fill="none" stroke="var(--brand)" strokeWidth="2" />
      </g>
      <g className="k-demo-card">
        <rect x="8" y="20" width="36" height="32" rx="5" fill="var(--paper)" stroke="var(--ink-3)" strokeWidth="2" />
        <line x1="15" y1="30" x2="37" y2="30" stroke="var(--ink-3)" strokeWidth="2" />
        <line x1="15" y1="38" x2="31" y2="38" stroke="var(--ink-3)" strokeWidth="2" />
      </g>
      <g className="k-demo-done">
        <circle cx="216" cy="36" r="14" fill="var(--success-soft)" stroke="var(--success)" strokeWidth="2" />
        <path d="M209 36l5 5 9-10" fill="none" stroke="var(--success-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
