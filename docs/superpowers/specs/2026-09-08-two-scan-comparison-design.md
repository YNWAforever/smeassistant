# Changes-first two-scan comparison

Date: 2026-09-08
Status: Implemented and independently reviewed through runtime commit `855f647`; the full local repository gate passed and verification is recorded in the documentation commit containing this file.
Baseline: origin/main at be2107d429f2b924f3441765caa24a06a2a1fbac (PR #9 merged).

## Outcome and scope

Help a report reader understand what changed between the displayed scan and the most recent earlier comparable scan for the same location. Use existing stored scans only. Lead with measured changes, retain the current report dashboard, and keep supporting detail expandable. The user approved changes-first presentation, comparison selection and access rules, the content hierarchy, and fixture-only verification.

This slice adds no collection, paid provider calls, emails, database migrations, scoring formulas, deployment, or domain changes. It does not add a full timeline, arbitrary scan picker, cross-business benchmarking, action workflow, or new engagement estimates. Preserve unrelated work and all existing evidence and draft permissions.

## Existing foundations

The report props currently hardcode comparison.kind to first_scan. Replace this placeholder with verified comparison state; an unavailable comparison is not proof that this is the first scan.

The scoring package already has diffScans, which checks scoring versions and shared measured modules before comparing scores and findings. Reuse its score rules if scores are included; do not apply score-version restrictions blindly to independent raw measurements. The existing scan-metrics derivation supplies bounded IG samples and source-scoped search observations, including unknown and excluded records. Preserve its measurement limitations.

## Selecting the pair

The displayed report is the current side, even when the reader opens an older report. Select the most recent strictly earlier completed scan that belongs to the same server-resolved location, is independently authorized for this reader, and shares at least one eligible comparable metric. Order by stored completion timestamp descending, with stable scan ID ordering to break candidate ties. Exclude the displayed scan. Missing or invalid dates cannot establish an earlier candidate.

Use persisted location identity, not business-name similarity or caller-supplied location context. If the displayed scan has no reliable location association, return comparison unavailable. Do not infer an association or repair historical records in this slice.

Show both scan dates. When a newer eligible-to-read candidate cannot be compared and an older candidate is selected, describe the pair as the previous comparable scan rather than the immediately previous scan. Never disclose inaccessible candidates, their existence, dates, counts, or evidence.

Do not silently select the best-looking result. Selection depends on chronological order and comparability, never the direction or size of a change. Candidate lookup must remain location-scoped and deterministically ordered. Reuse repository pagination as needed. A safety-bound exhaustion remains an internal selector result and is projected outward as the same neutral `no_accessible_pair` state used for empty or inaccessible history. It must never create a false first-scan claim or reveal hidden history cardinality.

## Comparable values and coverage

A metric needs a valid value on both sides, matching units and meaning, and measured source modules on both sides. Missing, failed, unsupported, conflicting, or untrustworthy values remain unavailable. Genuine measured zero remains zero. Compute differences before display rounding; use percentage points for differences between percentages.

For search visibility, match exact stored query, engine, surface, query type, and settings context. Unknown required matching context cannot establish equivalence. Build both values over the same set of eligible query identities present on both sides. Display the common denominator and disclose omitted queries separately. Duplicate or conflicting observations must not be selected arbitrarily. Preserve the existing organic-evidence ambiguity rules: a global merchant-found flag driven by AI evidence does not prove organic presence or absence.

The initial comparison uses established stored metrics: eligible search appearance/mention counts and rates on a common query cohort, and distinct stored IG sample counts where the sample definition is compatible. IG sample size changes are neutral coverage observations, not growth or decline in the business. Publication spans remain evidence context, not posting frequency. Do not calculate IG engagement averages or rates from ambiguous historical counts. Rating, review-count, individual-rank and score deltas are outside this first slice. Existing current-scan values remain available in their current sections. This keeps the new comparison limited to the established search metrics and IG sample coverage.

Keep coverage changes separate from measured business changes. A failed source or newly missing finding is not evidence of improvement. Do not add finding-resolution or score-change claims in this slice. Never claim an action caused a measured change. The existing scoring diff remains unchanged.

## Presentation

Place a concise changes summary near the top of the authorized report. Show counts of comparable metrics that increased, decreased, or stayed unchanged. Each count uses the same deterministic metric rows shown below, excluding coverage-only observations and unavailable values. Do not count a search numerator and its derived percentage as two separate changes.

Use compact cards or rows with previous value, current value, and difference. Display scan dates once clearly above the pair and retain source observation dates in evidence details. Increased and decreased describe numeric direction; improved and worsened are used only where direction has an established meaning. For the included search rows, higher appearance or mention rate means improvement within the matched sample only. Avoid treating more sampled IG posts as better performance.

Place changed coverage and unavailable measurements in a separate concise area. Expandable supporting evidence shows matching scope, eligible sample sizes, excluded observations, and source timestamps. Preserve the current responsive layout and en, zh-HK, and zh-TW support. Use readable text equivalents for indicators, keyboard-accessible disclosures, and more than color alone to express direction.

A valid pair with unchanged measurements shows an explicit unchanged state. A pair with some unavailable rows still shows valid changes. If no accessible comparable earlier scan is available, keep the current report usable and show a neutral explanation. Distinguish unreadable/unsupported comparison data and transient lookup failures from a confirmed absence of eligible history, without revealing unauthorized history. A comparison failure must not fail the current report.

## Server data flow and authorization

Keep selection, access decisions, and raw stored data on the server. A focused loader resolves the displayed scan's location, selects candidates, and checks existing read authority independently for both scans before loading their private evidence. Granting or unlocking the displayed report does not grant access to another report. Use only already supported access paths; do not broaden share-route membership or staff behavior as a workaround.

A pure comparison module accepts validated, authorized data from the pair and derives comparable rows, coverage changes, and availability reasons. Separate metric matching and calculation from rendering. The report projection receives only bounded, sanitized comparison values and evidence. Reuse safe URL/text and evidence limits from the current metrics implementation. Truncation must be disclosed and must not produce an apparently complete common query cohort.

Public and locked report projections omit private comparison data from props, HTML, and React Server Component payloads. Preserve accepted viewers and out-of-scope managers' existing evidence reads. No comparison operation grants draft authority or changes server-resolved action/location enforcement, including omitted and spoofed context. Do not expose raw provider payloads or add browser-side authorization decisions.

## Verification and acceptance

Use fixtures and isolated local services only. Pure tests cover chronological selection, stable ordering, older displayed reports, unrelated locations with similar names, missing location identity, invalid dates, skipped incomparable candidates, and selection independent of favorable results.

Metric tests assert exact values and differences for matched queries/settings, mixed engines/surfaces, changed query cohorts, genuine zero, missing values, conflicting duplicates, unavailable modules, rounding, denominator changes, and historical organic ambiguity. Assert that coverage-only IG sample changes do not enter the improvement summary. Assert that no new score or finding-resolution deltas are emitted.

Authorization tests deny each side independently, including a viewer grant for the current report only, revoked/expired grants where supported, and omitted or spoofed context. Check that inaccessible candidate metadata never leaks. Preserve existing accepted-viewer and manager read regressions and draft-denial tests. Test public and locked props, HTML, and real RSC payloads, not only hidden UI.

Component tests cover valid changed, unchanged, IG-only, partial, and unavailable states in all three languages. Actual-route browser coverage proves locked and current-only-unlocked HTML/RSC privacy plus the unavailable state. Because the default route cannot independently authorize an earlier scan and no fixture-only browser surface exists, successful-pair browser screenshots and keyboard disclosure activation remain explicit release gaps rather than passed cases.

Run focused tests, the normal repository gate, and the relevant fixture E2E suites during implementation. Report exact passes, failures, and skips separately; do not treat skipped cases as passed. Independent authorization and test review belongs before integration. No live scan, provider, shared-database mutation, or deployment is needed to verify this design.

## Review and next step

The user approved this complete specification on 2026-09-08. The implementation plan is docs/superpowers/plans/2026-09-08-two-scan-comparison.md. Tasks 1-5, the whole-branch authorization/test review, and the Task 6 local repository gate are complete through runtime commit `855f647`. Verification is recorded in `docs/integration/2026-09-08-two-scan-comparison-verification.md`. No publication is included. The next task is branch integration; the successful-pair browser and default-route authorization-entry-point limitation remains unresolved. No publication is included.
