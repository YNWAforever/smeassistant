# P3.2 follow-up: honest comparison states

**Date:** 2026-09-24 · **Status:** approved in brainstorming, awaiting spec review · **Base:** `main` at `073c4ae`

## What this closes

The Master Plan's P3.2 requires the report to "show no-access, no-pair, non-comparable and insufficient-evidence states separately from a successful comparison". The P3.2 phase record lists the remaining gap: `ScanComparison`'s `no_accessible_pair` fires for three different situations the plan names separately:
- no earlier scan exists;
- an earlier scan exists but authorization denied it;
- an authorized earlier scan shares no comparable cohort.

This design separates them without weakening the rule approved in the 2026-09-08 two-scan comparison design: "Never disclose inaccessible candidates, their existence, dates, counts, or evidence."

## How both rules can hold

Two kinds of reader reach the comparison:

- **Workspace members and staff** read every scan of their workspace's locations: `authorizeReport` resolves them before any viewer grant. For them, "there is no earlier scan", "the earlier scan measured different searches" and "the earlier scan was incomplete" reveal nothing they cannot already open.
- **Viewers** hold a single-report grant (`sme_report_grant`). A grant never covers another scan, so a viewer can never obtain a comparison, whatever history exists.

The no-access state is therefore decided from **who is reading**, not from **what history exists**. A viewer always gets the same fixed message, before any history lookup. Their message is identical whether earlier scans exist or not.

The owner chose this over keeping the neutral message for viewers or hiding the panel from them (2026-09-24).

## States

`ScanComparison`'s unavailable reasons become:

| Reason | Meaning | Reachable by |
|---|---|---|
| `no_history_access` *(new)* | The reader holds a viewer grant. Decided before any candidate is listed, authorized or read. | viewers |
| `no_earlier_scan` *(new)* | No valid earlier candidate exists: same workspace, same location, `done` or `partial`, valid completion time strictly before the current scan's. | members, staff |
| `insufficient_evidence` *(new)* | Earlier candidates exist, but evidence is missing or incomplete on one side, so nothing overlapping could be compared. | members, staff |
| `not_comparable` *(new)* | Earlier candidates have usable evidence, but none shares a query cohort or a compatible Instagram sample with the current scan. | members, staff |
| `no_accessible_pair` *(kept)* | Valid earlier candidates exist but none was authorized. This is a defensive fallback that members and staff are not expected to reach. It is also the outward projection of the internal `history_limit`. | anyone |
| `missing_location`, `invalid_current_scan`, `lookup_failed`, `history_limit` | Unchanged. | as today |

### Selection order (`loadScanComparison`)

1. Reader is a viewer → `no_history_access`. No port is called.
2. The current scan is invalid → `missing_location` or `invalid_current_scan`, as today.
3. Walk candidates newest-first exactly as today: the same pagination, validity check, independent authorization and timestamp check. The first `changes` result → `available`. If the current scan has no usable evidence, the first valid and authorized candidate → `insufficient_evidence`, without reading that candidate's input.
4. If the walk ends without a comparison:
   - no valid candidate was seen → `no_earlier_scan`;
   - valid candidates were seen, but none was authorized → `no_accessible_pair`;
   - **any** authorized candidate returned `insufficient_evidence` → `insufficient_evidence`;
   - otherwise → `not_comparable`.
5. A thrown error → `lookup_failed`. Candidate-cap exhaustion → `history_limit`. Both unchanged.

`insufficient_evidence` outranks `not_comparable`, because a rescan with fuller coverage could still produce a comparison. That is the more useful thing to tell the owner.

The current scan's own evidence is not checked up front. A scan with no usable evidence and no history should report `no_earlier_scan`, which is truer than `insufficient_evidence`. To keep this cheap, the loader computes `hasUsableEvidence(current)` once. If it is false, the walk stops at the **first valid and authorized** candidate and returns `insufficient_evidence` without calling `readInput` for it. Such a walk costs at most today's, and usually far less.

This is a deliberate refinement of the order presented during brainstorming, which checked the current scan's evidence before the history lookup. That order would have reported `insufficient_evidence` for a scan with no history at all.

## Derivation (`lib/report/comparison/derive.ts`)

### `hasUsableEvidence(input: ComparisonInput): boolean`

True when the input has either:
- at least one search cohort with `complete: true` containing at least one query whose folded outcome is known (`present` or `absent`), using the existing `foldFacts` rules: unknown or conflicting observations are dropped; or
- an Instagram sample with `complete: true`.

An unmeasured module contributes no cohorts and no sample, so it counts as no evidence.

### `compareScanMetrics(previous, current)`

`compareScanMetrics` returns a discriminated result instead of `PairChanges | null`:

```ts
type PairComparison =
  | { kind: 'changes'; changes: PairChanges }
  | { kind: 'insufficient_evidence' }
  | { kind: 'not_comparable' };
```

- `changes`: exactly today's non-null result. Rows, counts, denominators, omitted-query counts, evidence and the Instagram delta are all unchanged.
- `insufficient_evidence`: returned when either side fails `hasUsableEvidence`, or when the two sides **overlap** but nothing in the overlap is usable. Two sides overlap when either:
  - a cohort key is present on both sides and shares at least one query identity, whatever its outcome; or
  - both sides have an Instagram sample with the `stored-post-sample-v1` definition.
  Examples: one side's overlapping cohort is incomplete, every shared query folds to unknown, or the shared queries exceed `MAX_EVIDENCE_ROWS`.
- `not_comparable`: both sides have usable evidence and they do not overlap.

`load.ts` is the only non-test caller, so the signature change is contained.

## Presentation

`components/report/scan-comparison.tsx` keeps its current unavailable layout and renders the new reasons from `lib/report/comparison/copy.ts`.

| Reason | en | zh-HK | zh-TW |
|---|---|---|---|
| `no_history_access` | Comparing with earlier scans needs workspace access. Sign in as the business owner to see changes over time. | 與較早的掃描比較需要工作台權限。請以商戶負責人身分登入，查看隨時間的變化。 | 與較早的掃描比較需要工作台權限。請以店家負責人身分登入，查看隨時間的變化。 |
| `no_earlier_scan` | There is no earlier finished scan of this location to compare with yet. | 此地點暫時未有較早而已完成的掃描可供比較。 | 此據點目前還沒有較早且已完成的掃描可供比較。 |
| `insufficient_evidence` | An earlier scan exists, but one of the two didn't collect enough complete evidence to compare. A rescan with fuller coverage may make a comparison possible. | 已有較早的掃描，但其中一次未有收集到足夠完整的證據作比較。覆蓋較全面的重新掃描或可進行比較。 | 已有較早的掃描，但其中一次沒有收集到足夠完整的證據來比較。涵蓋更完整的重新掃描或許能進行比較。 |
| `not_comparable` | Earlier scans checked different searches or settings, so a like-for-like comparison isn't possible. | 較早的掃描檢查了不同的搜尋或設定，因此無法作同等比較。 | 較早的掃描檢查的是不同的搜尋或設定，因此無法進行同基準比較。 |

None of the copy says "first scan". `no_earlier_scan` claims only what the loader checked: no earlier *finished* scan of this location.

`projection.ts` is unchanged. `history_limit` still leaves the server as `no_accessible_pair`, and the four new reasons pass through.

## Data flow

`lib/report/load-report.ts` already resolves the current report's `access` (line 116) and returns early for `public`. It passes `access.kind` (`viewer`, `member` or `staff`) to `loadScanComparison` as a new fourth argument, `reader`. The ports, their authorization and the candidate query are unchanged.

## What does not change

- **A comparison failure never fails the report.**
- **Access does not widen.** Every candidate is still authorized independently through `authorizeReport`. A viewer grant still covers only its own report. Member, staff, drafting and location enforcement are unchanged.
- **Privacy.** Public and locked reports still carry no comparison data in props, HTML or RSC payloads. Stored-scan cardinality stays internal.
- **No migration.** No schema change, and nothing new is read from the database.
- **Vendored packages.** Unchanged, and so are `diffScans` and the scoring rules.

## Testing

**Derivation** (`derive.test.ts`):
- `hasUsableEvidence` covers:
  - a complete cohort with a known outcome (true);
  - an incomplete cohort (false);
  - a complete cohort with only unknown or conflicting facts (false);
  - no cohorts and no sample (false);
  - a complete Instagram sample (true);
  - an incomplete sample (false).
- `compareScanMetrics` returns:
  - `not_comparable` for disjoint cohorts with usable evidence on both sides;
  - `insufficient_evidence` when an overlapping cohort is incomplete on one side, when the overlapping queries are all unknown, when one side has no evidence, and when the overlap exceeds `MAX_EVIDENCE_ROWS`;
  - existing `changes` assertions, updated to the new shape.

**Loader** (`load.test.ts`):
- A viewer gets `no_history_access`, and the `list`, `authorize` and `readInput` ports are **never called**. This test proves the no-leak property.
- A member gets `no_earlier_scan` (empty history, and history containing only other-location or unfinished jobs), `insufficient_evidence` and `not_comparable`.
- A current scan with no usable evidence and no history gets `no_earlier_scan`. With history it gets `insufficient_evidence`, and `readInput` is called for no candidate.
- When candidates fail differently, `insufficient_evidence` outranks `not_comparable`.
- A newer non-comparable candidate is still skipped for an older comparable one.
- All valid candidates denied gives `no_accessible_pair`.
- The existing `lookup_failed`, `history_limit`, `missing_location` and `invalid_current_scan` cases are kept.

**Every new case must be shown able to fail:** remove its rule and the named test fails. For example, drop the viewer shortcut and the "ports never called" test must fail.

**Report**: `load-report.test.ts` passes the real access kind on the viewer and member paths. Existing public and locked privacy assertions stay green.

**Panel** (`scan-comparison.test.tsx`): every new reason renders in en, zh-HK and zh-TW, and no rendered string contains "first scan".

**End-to-end** (`e2e/acceptance/report-scan-comparison.spec.ts`): the current-only-unlocked viewer case now expects `comparisonCopy[locale].unavailable.no_history_access`. Its privacy assertions are unchanged.

**Gates:** `typecheck`, `lint`, `test`, `test:integration`, `e2e` and `e2e:acceptance`. `build` is expected to stay blocked by the standing Windows Turbopack/radix-ui issue, with `next build --webpack` run as a labelled diagnostic.

## What this does not prove

- **The successful-pair browser artifact stays a release gap.** A comparable pair in a real browser needs hosted access and authorization, as recorded since 2026-09-08.
- **The copy has not been reviewed by a native speaker.** It follows the repository's register rules: 香港書面中文 for zh-HK, 台灣用語 for zh-TW.
