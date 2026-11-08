# Phase 1B report: visual explanation and motion system

Date: 2026-10-20 · Branch: `ux/phase-1b-visual-motion`, cut from `ux/phase-1-design-system` (PR #95) · Not pushed.

This phase builds and demonstrates the visual components. No product page uses them yet. Decisions taken on 2026-10-20:

| Decision | Choice |
|---|---|
| Page transitions | CSS only. No experimental View Transitions flag. |
| Wiring | Build and demonstrate now; wire into pages in Phases 2–4 |
| Kit location | One home for visuals: `components/visual/`. The Phase 1 ScoreDial, CoverageMeter and fact-type badge/legend moved there. |

No API contract, migration, `packages/*`, auth, data access or dependency changed.

## What changed

| Step | Commit | Result |
|---|---|---|
| Motion system | `0cd3356` | **Presets** (`app/styles/motion.css`): fade-up, scale-in, slide-panel, progress-fill, check-draw, shimmer, pulse, plus a staggered reveal. **Hooks** (`components/visual/motion.ts`): `useReducedMotion`, `useInView`, `useReveal`, `useCountUp` and (in the next commit) `useChangeFlash`. The still state is the default: presets only animate inside `prefers-reduced-motion: no-preference` and when the manual switch is off. A test enforces this on the stylesheet. |
| Move + animate | `d1a4040` | **Moved:** `ScoreDial`, `CoverageMeter` and `FactTypeBadge`/`FactTypeLegend` from `components/kinnso`, with shared icons in `icons.ts`. **ScoreDial:** below the fold, the arc fills and the number counts up once. A new score counts from the old one only when `comparable` is true, otherwise it jumps. **CoverageMeter:** pending segments shimmer while on screen; a segment that changes state scales in once. **Fact-type chip:** an opt-in tooltip. **Strings:** all visual copy in `lib/copy-visual.ts` (en / zh-HK / zh-TW), reached as `copy[locale].ui.visual`. |
| Data visuals | `04847f7` | **`TrendChip`:** direction plus words, or "Not comparable" with the reason; never a number. **`Sparkline`:** lines join only comparable neighbours; an unknown value is a gap. **`ImpactEffortMatrix`:** a 2×2 plot plus a numbered list, labelled **Recommended**. **`BeforeAfterCompare`:** side-by-side or slider, labelled **Attributed, not proven**; it refuses scans that are not comparable. |
| Process visuals | `c326bae` | **`LoopStepper`:** Scan → Decide → Approve → Deliver → Prove. **`ApprovalFlow`:** Draft → Needs approval → Approved → Delivered, with a lock before Approved and the line "nothing goes out until you approve". **`ScanProgress`:** one row per source, a pulse while pending, and only the summary announced. |
| Explainers | `d328272` | **`EvidencePreview`:** renders nothing without a source, a valid observed date and a plain-language limitation (limitation made required after review). **`InlineExplainer`:** a "?" pop-up with one sentence; its demo (`ApprovalDemo`) is paused until hovered or focused. **`EmptyIllustration`:** one SVG set (no data, no actions, all done, error, no permission). The kit's `EmptyState` / `ErrorState` / `PermissionDenied` now use it, each with one next-step button. |
| Feedback | `3b08a24` | **`ApprovedCheck`:** check-draw. **`CopyExportButton`:** turns into a check, raises a toast, and keeps a fixed width. **`UsageMeter`:** a labelled meter, a count-up, and "Delivery counted" when usage rises. **`FirstApprovalPulse`:** shown once per workspace in this browser. **`PageTransition`:** a CSS fade for route templates, tablet and up. None of these approves, exports or counts anything; they only reflect a result the caller passes in. |
| Fix | `2db8c4a` | Inline links and the "?" trigger no longer pick up the legacy 44 px minimum height (see Deviations). The matrix "Impact" label is horizontal. |
| Gallery | `255dd74` | `/dev/design-system` shows every visual. Buttons drive each state change: comparable vs non-comparable rescan, advance scan, next loop and approval step, count a delivery, approve, and show the first approval again. A replay button covers entrances. Dark preview and the reduced-motion switch apply to all of it. |

## Guardrails built into the components

| Guardrail (CLAUDE.md §0) | How the components enforce it | Test |
|---|---|---|
| 1. Evidence before score | `EvidencePreview` renders nothing without a source, a valid observed date and a limitation. | `explainers.test.tsx` |
| 2. Unavailable ≠ zero | A withheld score shows "No score yet" and never animates. Pending, unavailable and failed sources stay visible and distinct; a pending shimmer never fills a segment. | `data-visuals.test.tsx`, `process.test.tsx` |
| 3. Comparable before change | The trend chip shows no number without a comparable pair. The sparkline never draws across a non-comparable scan or an unknown value. The dial animates old → new only when `comparable`. Before/after refuses non-comparable scans. | `charts.test.tsx`, `data-visuals.test.tsx` |
| 4. Fact types | The matrix is Recommended. Before/after is Attributed, and the label "Attributed, not proven" is always shown. | `charts.test.tsx` |
| 5–6. Approval boundary, no auto-publish | The approval flow puts a lock before Approved. The export toast says "Nothing is published automatically". | `process.test.tsx`, `feedback.test.tsx` |
| 7. Approved deliveries | The usage meter counts deliveries, never tokens. "Delivery counted" appears only when the server's count rises. | `feedback.test.tsx` |

## Measures

| | Target | Result |
|---|---|---|
| Motion JS (`components/visual/motion.ts`, minified + gzip) | — | **1.1 KB** |
| All of `components/visual` incl. its strings (minified + gzip; React, Radix, lucide and sonner external) | added motion JS < 30 KB | **9.1 KB** |
| New dependencies | none without asking | none |
| axe-core (WCAG 2.2 AA) on the gallery after every state change, 3 locales × 390/1440 × light/dark | 0 | **0** |
| Cumulative layout shift on the gallery, while scrolling every reveal and pressing the state buttons, same 12 runs | none new | **0** in all 12 |
| Horizontal overflow at 390/1440 | none | none |
| Largest new file | under 300 lines | 190 (`gallery.tsx`); largest component 151 (`motion.ts`) |

Captures (dev server, after state changes):
- [English, 1440](phase-1b/gallery-en-1440.jpg)
- [zh-HK, 1440, dark](phase-1b/gallery-zh-HK-1440-dark.jpg)
- [zh-TW, 390](phase-1b/gallery-zh-TW-390.jpg)

## How motion behaves

- **Still by default.** Under reduced motion (OS setting or the manual switch), every component shows its final state at once. Count-ups jump, reveals stay visible, and loops do not run.
- **Nothing on screen at load is hidden or replayed.** Reveals and count-ups play only for elements that start below the fold, or when a value changes after load. Numbers render their real value in the server HTML, so there is no flash of 0 and no layout shift.
- **Loops** (pending shimmer, pending pulse, explainer demo) run only while they mean something: a source is still being checked, or the owner is hovering the demo. They pause off screen.
- **Durations** come from the tokens: 150–300 ms for feedback, 600 ms for explanatory sequences. `MOTION` in `motion.ts` mirrors them for JS.

## Deviations from the plan

1. **The score arc moves `stroke-dashoffset`, not transform or opacity.** It is paint-only inside a fixed-size SVG and follows the counted number, so arc and number stay in sync. CLS measured 0. Every other animation uses transform and opacity only.
2. **"Card moves to Approved" is left to the page.** Moving a card between lists depends on the Phase 4 Actions layout. This phase provides the moment itself (`ApprovedCheck` check-draw); the move is wired in Phase 4.
3. **The legacy layer forces `min-height: 44px` on every link and button.** That rule sits in `01-prototype.css`, which loads after the new layers. New inline links stay inline, which is exempt, and the "?" trigger has a deliberate 44 px hit area. The rule goes away as pages leave the legacy layer.
4. **Only one explainer demo exists (`ApprovalDemo`).** Demos for coverage, fact types and rescan comparison are added with their pages in Phases 2–4, where their copy is decided.
5. **The first-approval "once" is per browser** (local storage, a per-viewer convenience). Whether an approval is the first is the caller's server-backed fact (`active`); storage only stops the pulse repeating.
6. **`EvidencePreview` hides itself without a date, while `EvidenceBadge` says "Date not recorded".**
   - **Why they differ:** a preview is a claim card, so it needs provenance to appear at all. The badge is a status line, where stating the gap is the honest choice.
   - **Ask:** say if you want one rule for both.

## Wiring plan (later phases)

| Phase | Components |
|---|---|
| 2 Public site | LoopStepper (how it works), ScoreDial and CoverageMeter in the sample report, InlineExplainer, FactTypeLegend on /methodology |
| 3 Scan and report | ScanProgress (replaces the spinner), ScoreDial + CoverageMeter + TrendChip, EvidencePreview on findings, empty states |
| 4 Workspace | ImpactEffortMatrix and LoopStepper on Today; ApprovalFlow, ApprovedCheck, CopyExportButton, UsageMeter, FirstApprovalPulse on actions; Sparkline and BeforeAfterCompare on Insights; PageTransition in the workspace `template.tsx` |

## Verification

All gates ran sequentially on the final head.

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | pass (root and 4 packages) |
| `corepack pnpm lint` | 0 errors, 40 warnings (same as before; none in new files) |
| `corepack pnpm test` | 5,855 + 62 root tests; scoring 183, region 23, contracts 20, scan-engine 299. All pass. |
| `corepack pnpm build` | pass |
| `test:secret-boundary` | pass (93 public artifacts) |
| `test:no-supabase`, `test:no-self-service-claim` | pass |
| `corepack pnpm e2e` | **Not run.** The fixture needs Docker, which this environment lacks; CI runs it. No route or flow changed in this phase. |

New tests (50 cases), all in `components/visual/`:
- `motion.test.tsx`: reduced motion, count-up, reveal, and the stylesheet contract
- `data-visuals.test.tsx`
- `charts.test.tsx`
- `process.test.tsx`
- `explainers.test.tsx`
- `feedback.test.tsx`

## Open questions

1. **Deviation 6:** should evidence without a date hide the card, or show "Date not recorded" everywhere?
2. **Still open from Phase 0** (these decide Phase 4):
   - the assistant's name
   - whether bulk approve is allowed
   - Fix Pack drafts
   - whether to merge Create, Offers and Starter pack
