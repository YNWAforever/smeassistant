# Existing scan evidence metrics

Date: 2026-09-08
Status: Design sections approved; written specification awaiting user review.
Baseline: origin/main at 88b912d9e79a9191d4bde758e9d0407d24b0f948 (dashboard PR #8 merged).

## Outcome and scope

Make the report dashboard more useful with measurements derived only from evidence already stored by scans. The user selected evidence-first metrics and approved the measurement rules, server data flow, access boundaries, and fixture-only verification approach. No new collection, provider calls, database migration, scoring formula, or combined visibility index belongs to this slice.

Use the existing dashboard layout. Expand the IG and search metric areas with concise counts, eligible sample sizes, and evidence disclosures. Do not imply that sampled observations represent all Instagram activity, all search results, market share, or an industry benchmark. Preserve current source-scoped competitor comparisons.

## Existing constraints confirmed in source

- lib/report/sanitize-proof.ts currently truncates IG posts to six and AEO runs to six for presentation. Aggregate derivation must precede these display limits.
- The IG collector in packages/scan-engine/src/collect-providers.ts defaults some missing like/comment counts to zero before storing them. The report sanitizer also defaults missing counts to zero. Historical zeros therefore do not establish measured absence.
- The report's current AEO projection defaults an omitted availability flag to true. That presentation fallback is insufficient proof of successful collection for a new denominator.
- Merchant observations retain engine and collection status in stored evidence. packages/scan-engine/src/serpapi-normalizers.ts derives availability from successful status with no error and distinguishes AI answer presence from merchant mention. Reuse these semantics where the stored fields support them.
- Existing dashboard metrics are guarded by authorized access and the matching measured module. Preserve both guards.

## IG measurements

Show the number of distinct stored sampled posts, plus the number with valid publication dates and the earliest/latest valid dates. Describe this as the captured sample's publication span, not a complete collection window. Do not derive a posting frequency or assume there were no other posts between those dates. If no valid dates exist, show the sample count and date unavailable separately.

Show recorded likes and comments in supporting per-post evidence. Valid finite nonnegative integer values may be displayed as recorded counts, with a nearby historical-data-quality note explaining that zero may include an unavailable count. Missing, negative, nonnumeric, and nonfinite counts remain unknown. Do not label ambiguous historical zero as a verified zero.

Keep engagement averages and follower-based engagement rates unavailable in this phase: current historical evidence cannot reliably distinguish all missing counts from measured zero. Do not average only positive counts, replace missing counts with zero, or invent provenance flags. A future trustworthy collection contract is outside this design.

Use post identity from stored evidence, preferably its stable ID and otherwise an existing canonical post URL. Never deduplicate by caption alone. Identical repeated records count once. Conflicting records for the same identity must not produce an arbitrary count/date value; mark affected fields unknown. Records lacking a usable identity can remain visible as supporting evidence but are excluded from the distinct-post count, with the exclusion count disclosed. Do not merge the separate reel list into the post sample because video posts may occur in both lists.

## Search and AI measurements

Produce separate rows for organic results, Maps, and AI mentions, grouped by stored engine and query type when present. Do not combine differently scoped result types into a single percentage. Preserve exact query text and available observation timestamps in the disclosure.

A qualifying observation needs a recognizable engine/surface, a usable query, and explicit evidence that collection succeeded without an error. An omitted availability/status field is unknown, not success. Prefer the stored merchant run with collection metadata; use a legacy observation only when it independently carries sufficient explicit evidence. Never count both projections of one observation.

For organic and Maps, the numerator is eligible observations with a positive integer merchant rank for that surface. The denominator includes only successful observations whose stored result shape establishes that the relevant surface was evaluated. A null rank alone does not prove a measured absence. A successful request without sufficient surface evidence is excluded as unknown. If the stored schema cannot establish an eligible denominator, that row remains unavailable.

For AI mentions, the denominator is successful observations with explicit evidence that an AI answer was returned and an explicit boolean mention result. The numerator is those observations with mention true. No answer, unsupported queries, provider errors, and unknown mention results are excluded and reported separately. Keep engines separate; do not treat an AI citation as interchangeable with a mention.

Identify a query observation by its stored stable identity where available; otherwise use the exact query, engine, query type, and observation timestamp when present. Identical duplicates count once. Contradictory duplicates are excluded from the affected metric and identified as ambiguous; never choose the favorable result. Missing timestamps must not be fabricated. Query matching must not collapse different locales or business contexts.

Display the count as X of N eligible observations, with a compact bar whose maximum is N. A percentage may be secondary and equals 100 * X / N, rounded only for display to one decimal place. N = 0 is unavailable, never 0%. X = 0 with N > 0 is a measured zero. Label the result as appearance or mention within the scanned sample, not general discoverability.

## Coverage, dates, and presentation

Each metric includes its source, unit, sample denominator or sample count, and scan date. An existing scan completion date is a scan date, not proof that all source observations were made then. Preserve source dates separately; missing dates display unavailable. The evidence disclosure explains included observations and exclusions without placing long diagnostic text in the main dashboard.

Keep uncertainty next to the affected value. A partially usable sample may show a result with an explicit incomplete-coverage label and eligible/excluded counts. An unavailable module suppresses stale associated metrics even if old proof exists. One failed source must not block other valid metric groups.

Retain the current responsive dashboard, accessible text equivalents for bars, keyboard-operated disclosures, and supported en, zh-HK, and zh-TW locales. Do not create an additional visual redesign or change overall report scoring, priority ordering, historical comparability, or existing gallery behavior.

## Data flow and access

Create a focused pure derivation module over stored evidence that returns bounded presentation metrics, coverage counts, availability reasons, and sanitized supporting observations. Calculate over the stored sample before the existing short evidence-display slices, with a documented deterministic safety limit for oversized malformed input. If that limit is reached, explicitly label the resulting sample as truncated; do not claim it covers every stored record.

Keep raw provider payloads server-side. Extend the authorized report model with the derived metrics rather than handing unrestricted raw payloads to a client component. Separate validation/derivation from JSX. Reuse current safe text, URL, and localization conventions.

Only build and expose these metrics through the existing authorized report projection. Public and locked report HTML, React Server Component payloads, and props must omit new metrics and private supporting evidence. Preserve accepted viewer reads, existing member/staff projection rules, and all existing draft authority checks. Do not fix or broaden the share route's existing membership resolver behavior as part of this slice.

## Verification and acceptance

Use fixture-only tests. Cover valid values, measured search zero, missing and malformed counts, ambiguous historical IG zero, post identity duplicates/conflicts, invalid dates, records beyond current display slices, and oversized-input truncation. Assert that ambiguous IG data never becomes a calculated engagement rate.

Cover successful presence and absence with explicit surface evidence, null rank without surface evidence, failed/unsupported requests, omitted success flags, absent AI answers, unknown mention booleans, duplicate/conflicting queries, mixed engines/query types, zero eligible observations, and partial coverage. Assert exact numerators, denominators, reasons, and displayed rounding.

Verify measured-module guards and authorized projection behavior. Public serialized output must exclude metric/evidence sentinels. Exercise the existing viewer-unlock report flow with owned fixtures, plus member/staff projection tests; do not describe these as browser membership authorization proof. Test mobile and desktop layout, localized labels, keyboard disclosures, and absence of browser errors after interactions.

Run focused tests followed by the normal repository gate, including owned Docker/PostgreSQL integration and fixture browser acceptance. Report exact passing, failing, skipped, and blocked results. Do not infer hosted success from fixtures or skipped cases.

Acceptance: an authorized merchant can see the captured IG sample and its limitations, and distinguish organic, Maps, and AI appearances with honest eligible denominators wherever stored evidence supports them. Unsupported metrics clearly explain why they remain unavailable. No private information reaches the public projection and no external collection occurs.

## Review and next step

Self-review checked historical zero ambiguity, success/surface eligibility, deduplication conflicts, sample truncation, missing dates, access separation, scope, and fixture coverage. No unresolved product choices are required for implementation planning. Exact helper names, safety-limit constants, and fixture paths are implementation-plan decisions constrained by these rules.

This document records an approved design, not implemented behavior or test results. After the user reviews this written specification, use the writing-plans skill to prepare the implementation plan. Do not begin implementation before that step.