"use client"

import { useState, type CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { BeforeAfterCompare } from "@/components/visual/before-after"
import { CoverageMeter, type CoverageSource } from "@/components/visual/coverage-meter"
import { EvidencePreview } from "@/components/visual/evidence-preview"
import { FactTypeBadge, FactTypeLegend } from "@/components/visual/fact-type"
import { ApprovedCheck, CopyExportButton, FirstApprovalPulse, UsageMeter } from "@/components/visual/feedback"
import { EmptyIllustration } from "@/components/visual/illustrations"
import { ImpactEffortMatrix } from "@/components/visual/impact-effort-matrix"
import { ApprovalDemo, InlineExplainer } from "@/components/visual/inline-explainer"
import { ScanProgress } from "@/components/visual/scan-progress"
import { ScoreDial } from "@/components/visual/score-dial"
import { ApprovalFlow, LoopStepper } from "@/components/visual/steps"
import { Sparkline, TrendChip } from "@/components/visual/trend"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { approvalFlowSteps, illustrationKinds, loopSteps } from "@/lib/copy-visual"
import type { ProviderStateName } from "@/lib/domain-labels"

import { Section } from "./section"

/**
 * Gallery sections for components/visual (dev route only). Sample values
 * are illustrative and never shown to merchants. Buttons drive each state
 * change so motion can be reviewed with the reduced-motion switch on and off.
 */
const SOURCE_KEYS = ["google_search", "google_business", "search_ai", "instagram", "website"] as const
const SCAN_SCRIPT: ProviderStateName[][] = [
  ["pending", "pending", "pending", "pending", "pending"],
  ["measured", "measured", "pending", "pending", "pending"],
  ["measured", "measured", "pending", "unavailable", "measured"],
  ["measured", "measured", "failed", "unavailable", "measured"],
]
const SPARK = [
  { id: "1", at: "2026-06-01T00:00:00Z", value: 48, comparableToPrevious: true },
  { id: "2", at: "2026-07-01T00:00:00Z", value: 53, comparableToPrevious: true },
  { id: "3", at: "2026-08-01T00:00:00Z", value: 57, comparableToPrevious: false },
  { id: "4", at: "2026-09-01T00:00:00Z", value: null, comparableToPrevious: true },
  { id: "5", at: "2026-10-01T00:00:00Z", value: 60, comparableToPrevious: true },
  { id: "6", at: "2026-10-19T00:00:00Z", value: 62, comparableToPrevious: true },
]
const MATRIX = [
  { id: "a", title: "Reply to 3 reviews", impact: 0.8, effortMinutes: 10, href: "#" },
  { id: "b", title: "Translate the menu", impact: 0.65, effortMinutes: 20 },
  { id: "c", title: "Add story highlights", impact: 0.3, effortMinutes: 10 },
  { id: "d", title: "Local SEO brief", impact: 0.35, effortMinutes: 20 },
  { id: "e", title: "Add opening hours", impact: 0.7, effortMinutes: 10 },
]
const OBSERVED = "2026-10-19T06:00:00Z"

/** Gallery-only sample: five newest reviews, replied or not, spread across the width for the slider. */
function ReplyRow({ replied }: { replied: number }) {
  return (
    <div className="flex justify-between gap-2" aria-label={`${replied} of the newest 5 reviews have an owner reply`} role="img">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`grid size-10 place-items-center rounded-full text-xs font-bold ${i < replied ? "bg-success-soft text-success-text" : "bg-paper-2 text-ink-3 ring-1 ring-line"}`}>{i < replied ? "✓" : "–"}</span>
      ))}
    </div>
  )
}

export function VisualGallery({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].ui
  const [replay, setReplay] = useState(0)
  const [score, setScore] = useState(54)
  const [comparable, setComparable] = useState(true)
  const [scanStep, setScanStep] = useState(0)
  const [loop, setLoop] = useState(2)
  const [flow, setFlow] = useState(1)
  const [used, setUsed] = useState(1)
  const [approved, setApproved] = useState(false)
  const [firstKey, setFirstKey] = useState(() => `gallery-${Date.now()}`)
  const sources: CoverageSource[] = SOURCE_KEYS.map((key, index) => ({ key, label: t.sources[key], state: SCAN_SCRIPT[scanStep]![index]! }))

  return (
    <>
      <Section title="Motion">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => setReplay((n) => n + 1)}>Replay entrances</Button>
        </div>
        <p className="text-sm text-ink-2">Presets: fade-up, scale-in, slide-panel, progress-fill, check-draw, shimmer, number count-up. Each has a still equivalent; toggle reduced motion above.</p>
        <div key={replay} className="grid gap-3 sm:grid-cols-3">
          {["k-fade-up", "k-scale-in", "k-slide-panel"].map((preset, index) => (
            <div key={preset} className={`${preset} kinnso-card grid place-items-center p-6 text-sm font-semibold`} style={{ "--i": index } as CSSProperties}>{preset}</div>
          ))}
        </div>
      </Section>

      <Section title="Score, coverage and trend">
        <div className="flex flex-wrap items-start gap-8">
          <ScoreDial score={score} coverage={60} comparable={comparable} replay={replay} locale={locale} />
          <ScoreDial score={null} coverage={35} locale={locale} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => { setComparable(true); setScore((s) => (s >= 70 ? 54 : s + 8)) }}>Comparable rescan</Button>
          <Button variant="outline" className="min-h-11" onClick={() => { setComparable(false); setScore((s) => (s >= 70 ? 54 : s + 8)) }}>Non-comparable rescan (jumps)</Button>
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <TrendChip delta={4} comparable locale={locale} />
          <TrendChip delta={-3} comparable locale={locale} />
          <TrendChip delta={0} comparable locale={locale} />
          <TrendChip delta={6} comparable={false} reason="SCORING_VERSION_MISMATCH" locale={locale} />
          <TrendChip delta={null} comparable={false} reason="first" locale={locale} />
        </div>
        <Sparkline label={t.score.outOf} points={SPARK} locale={locale} width={200} height={48} />
        <CoverageMeter sources={sources} locale={locale} />
      </Section>

      <Section title="Scan progress">
        <ScanProgress sources={sources} locale={locale} />
        <Button variant="outline" className="min-h-11 justify-self-start" onClick={() => setScanStep((n) => (n + 1) % SCAN_SCRIPT.length)}>Advance scan</Button>
      </Section>

      <Section title="Loop and approval flow">
        <LoopStepper current={loopSteps[loop]!} locale={locale} />
        <ApprovalFlow state={approvalFlowSteps[flow]!} locale={locale} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => setLoop((n) => (n + 1) % loopSteps.length)}>Next loop step</Button>
          <Button variant="outline" className="min-h-11" onClick={() => setFlow((n) => (n + 1) % approvalFlowSteps.length)}>Next approval step</Button>
        </div>
      </Section>

      <Section title="Prioritisation and proof">
        <ImpactEffortMatrix items={MATRIX} locale={locale} />
        <BeforeAfterCompare
          mode="slider"
          comparable
          locale={locale}
          before={{ observedAt: "2026-09-01T00:00:00Z", content: <ReplyRow replied={3} /> }}
          after={{ observedAt: OBSERVED, content: <ReplyRow replied={5} /> }}
        />
        <BeforeAfterCompare comparable={false} reason="NO_SHARED_MEASURED_MODULE" locale={locale} before={{ observedAt: null, content: null }} after={{ observedAt: null, content: null }} />
      </Section>

      <Section title="Explainers">
        <p className="flex items-center gap-2 text-sm text-ink">
          {t.score.coverage}
          <InlineExplainer label={t.score.coverage} answer={t.states.partialBody} demo={<ApprovalDemo />} locale={locale} />
        </p>
        <div className="flex flex-wrap gap-2">
          <FactTypeBadge type="Observed" explain locale={locale} />
          <FactTypeBadge type="Attributed" explain locale={locale} />
          <FactTypeBadge type="Unknown" explain locale={locale} />
        </div>
        <FactTypeLegend locale={locale} />
        <div className="grid gap-3 md:grid-cols-2">
          <EvidencePreview source="Google Maps" observedAt={OBSERVED} factType="Observed" snippet="Friendly staff and the best wonton noodles in Tin Hau." limitation="Newest 5 reviews only" href="https://example.com" locale={locale} />
          <EvidencePreview source="Instagram" observedAt={OBSERVED} factType="Estimated" snippet="Last post 23 days ago" locale={locale} />
        </div>
        <div className="flex flex-wrap gap-6">
          {illustrationKinds.map((kind) => <figure key={kind} className="grid justify-items-center gap-1 text-xs text-ink-3"><EmptyIllustration kind={kind} /><figcaption>{kind}</figcaption></figure>)}
        </div>
      </Section>

      <Section title="Feedback moments">
        <div className="flex flex-wrap items-center gap-3">
          <Button className="min-h-11" onClick={() => setApproved(true)}>Approve (demo)</Button>
          {approved && <ApprovedCheck play locale={locale} />}
          <CopyExportButton mode="copy" onAction={() => true} locale={locale} />
          <CopyExportButton mode="export" onAction={async () => { await new Promise((resolve) => setTimeout(resolve, 400)); return true }} locale={locale} />
        </div>
        <div className="grid max-w-sm gap-4">
          <UsageMeter used={used} allowance={3} locale={locale} />
          <UsageMeter used={used + 4} allowance={null} locale={locale} />
          <Button variant="outline" className="min-h-11 justify-self-start" onClick={() => setUsed((n) => (n >= 3 ? 0 : n + 1))}>Count a delivery</Button>
        </div>
        <div className="grid max-w-sm gap-2">
          <FirstApprovalPulse key={firstKey} active storageKey={firstKey} locale={locale}>
            <div className="kinnso-card p-4 text-sm">Reply to 3 reviews · v2</div>
          </FirstApprovalPulse>
          <Button variant="outline" className="min-h-11 justify-self-start" onClick={() => setFirstKey(`gallery-${Date.now()}`)}>Show first approval again</Button>
        </div>
      </Section>
    </>
  )
}
