# Scan result dashboard redesign

Date: 2026-09-07
Status: Direction A and page structure approved; written specification awaiting user review.

## Problem and outcome

The scan report is too text-heavy for a merchant to quickly understand performance and decide what to do. Redesign the existing report as a 30-second merchant dashboard: recognizable statistics, honest visual comparisons, three priorities, and photo evidence. Keep deeper explanations available on demand.

Reference report: https://smeassistant.vercel.app/zh-HK/r/lgCAyQacd3pYKRFB_hW_m6zf

The user selected direction A from three local illustrative mockups and approved the structure below. Mockup numbers, competitors, targets, and image placeholders are illustrative only and must never become production fallback data.

## Page structure

1. Overall health: existing overall score, concise evidence-supported takeaway, business identity, scan date, and coverage. Preserve the existing score calculation and confidence semantics. Show an unavailable state when the model cannot support a score.
2. Key statistics: IG followers and sampled engagement, Google rating and review count, and search visibility. Each statistic includes its unit and source context; sampled metrics include the denominator or sample size. Do not force absent data into numeric cards.
3. Visual benchmarks: compact horizontal module-score bars plus observed competitor comparisons where matching evidence exists. Clearly distinguish report rubric scores from observed competitor statistics. Include query, engine, observation date, and sample size alongside comparisons.
4. Three priority actions: retain the existing evidence-backed priority ordering. Use a short action title, one supporting sentence, and a link to evidence or the relevant detail section. Show fewer than three when fewer are supported; do not invent padding actions or predicted score gains.
5. Photo evidence: IG and Google thumbnail groups using authorized stored snapshots, with accessible expanded previews and source/capture labels. Preserve metadata-only and failed-image states with useful source information. Never substitute invented images or bypass private media authorization.
6. Details on demand: collapse longer findings, methodology, coverage limitations, and supporting measurements into labeled disclosure sections. Keep essential uncertainty next to the metric it qualifies.

## Layout and interaction

Use the existing visual system with clear type hierarchy, neutral surfaces, blue/teal emphasis, and consistent spacing. Desktop places compact metric cards across the page and supporting sections in a readable grid; narrow screens use a single column without horizontal page scrolling. Charts resize within their cards.

Keep primary conclusions and key statistics above long evidence lists. Photo galleries display an initial thumbnail set and a count with an explicit reveal control for additional available items. Expanded photos support keyboard operation, Escape dismissal, focus restoration, and meaningful accessible labels.

Use horizontal bars with visible numeric labels and text equivalents. Never communicate status through color alone. Disclosure controls expose expanded state and remain keyboard operable. Avoid decorative animation; honor reduced-motion preferences.

## Measurement and comparison rules

- Missing, unavailable, failed, and measured zero remain distinct. Use the localized equivalent of 未能量度 for unavailable measurements, with concise reasons.
- Existing module scores are rubric scores, not market percentiles or industry averages.
- Competitors from a search result are labeled as observed results for that query and engine. They do not establish an industry baseline. Compare only matching metric types and units with recorded evidence; otherwise show a concise unavailable comparison state.
- Use an existing canonical engagement measure when present. Do not introduce a new engagement formula in this presentation slice; if no supported measure exists, show unavailable and retain supported raw counts in details.
- Search visibility shows the counted qualifying observations and eligible sample denominator defined by the existing model. Do not count failed queries as measured absence or silently mix incompatible engines/ranking types.
- Historical change appears only when the existing comparison model marks scans comparable. First scans show 首次掃描; incomparable scans explain why a change cannot be shown. No synthetic trend lines or zero deltas.
- Preserve source timestamps and limitations. The design does not collect new competitor datasets or promise complete coverage.

## Access and data flow

Keep existing server authorization and report-unlock behavior authoritative. The public locked report uses only its current public projection, with an improved summary/priorities layout and unlock call to action. Full statistics, comparisons, findings, and private media appear only when provided by the authorized report projection. Do not send hidden full-report data to the browser or implement locking through CSS.

Reuse the existing report loader, view-model construction, score calculation, comparison classification, priority selection, and authorized evidence loader. Derive presentation-ready statistics and chart rows through a pure adapter over the appropriate existing projection. Every derived value retains availability and source context. No extra provider calls, database schema changes, or new snapshot capture are needed for rendering.

Keep the report page orchestration thin. Extract focused presentation components for summary, statistics, comparisons, priorities, gallery, and disclosures as needed around components/report-view.tsx. Keep derivation outside JSX and private-media loading server-side. Reuse existing localization patterns across supported locales, with explicit Traditional Chinese copy for the requested route.

## Failure behavior

A missing source must not prevent other sections from rendering. A missing benchmark shows an explanatory empty state; a broken or expired media URL shows metadata and the existing authorized recovery behavior without a render-time rescan. Long captions and business names wrap safely. Reports with no measurable modules show coverage and next steps without a misleading overall numeric visualization.

## Scope boundaries

This is a report presentation slice. Preserve scoring, authentication, unlock semantics, rate limiting, provider integrations, snapshot limits and retention, and existing authorization roles. Do not add paid provider usage, emails, shared database migration, deployment, domains, or historical photo backfill. Those operations require their applicable separate authorization.

## Verification and acceptance

Use fixture-only automated coverage for full data, partial data, measured zero, unavailable modules, no benchmarks, first scan, comparable and incomparable scans, long text, and stored/metadata-only/failed photos. Assert values and denominators, chart labels and missing states, and correct omission of unauthorized statistics/media from public output.

Exercise existing public and authorized report boundaries; verify that gallery URLs follow the existing authorized path and restricted content is absent from public serialized data. Test disclosure and image-preview keyboard behavior, focus handling, mobile layout at 375px and desktop layout at 1440px, and supported locale rendering with deterministic local fixtures.

Run focused report/view-model/evidence tests and the normal repository gate identified from current package scripts and CI during implementation. Record exact passed, failed, skipped, or environment-blocked results separately. Do not call live providers or assume skipped E2E cases passed.

Acceptance: a merchant can locate overall status, supported key metrics, available comparisons, and up to three evidence-backed next actions without expanding long explanations; all original detailed evidence remains reachable within existing access rights. Implementation screenshots must use clearly identified fixtures and contain no mockup fallback statistics.

## Specification self-review

Checked scope, access separation, missing-versus-zero semantics, comparison validity, existing calculation reuse, photo limitations, accessibility, and deterministic validation. No unresolved product choices or placeholder requirements remain. Implementation planning follows user review of this document.
