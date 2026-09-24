# Honest Comparison States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the report comparison's catch-all `no_accessible_pair` with four honest states: `no_history_access`, `no_earlier_scan`, `insufficient_evidence` and `not_comparable`. Do this without revealing any scan the reader cannot open.

**Architecture:**
- `compareScanMetrics` returns *why* a pair has nothing to show, not `null`.
- `loadScanComparison` receives the reader's access kind. A viewer gets a fixed state before any history is touched. For members and staff, the loader classifies the walk's outcome.
- The panel renders each state from typed trilingual copy, one entry per reason.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, Vitest 4 (jsdom for the panel), Playwright (acceptance, run in CI only). pnpm 9.12.0 via corepack.

**Spec:** `docs/superpowers/specs/2026-09-24-comparison-states-design.md`. Read it first. Its "States" table and "Selection order" are the contract this plan implements.

---

## Ground rules for every task

- **Worktree:** `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p32-comparison-states`, branch `p32-comparison-states`. Run every command from there.
- **Never** `git push`, open a PR, deploy, or touch a hosted database. Do not edit `packages/**` or `neon/migrations/**`.
- **Commits:** write the message to a file and use `git commit -F <file>`. End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. New commits only; do not amend.
  - A hook blocks any command containing `git commit` together with a `-n` flag, because `-n` is git's short form of `--no-verify`. Keep `grep -n` and other `-n` flags out of the command that commits.
- **Before every commit**, run the full `corepack pnpm test` and `corepack pnpm typecheck`, not only the focused file. Lint (`corepack pnpm lint`) must stay at the baseline of 30 warnings and 0 errors.
- **Snapshot files:** a run may leave `lib/agents/__snapshots__/agents.test.ts.snap` and `lib/pocket-assistant/__snapshots__/demo.test.ts.snap` modified. Check them with `git diff --ignore-cr-at-eol --stat`. If that is empty, `git restore` them. Never commit them.
- **Mutation checks:** each task ends with checks proving its new tests can fail. Apply the named change, run the named test, confirm it fails, restore the change, and confirm the test is green again. Record what you observed. A mutation that does not fail is a finding: report it, do not skip it.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/report/comparison/types.ts` | modify | `PairComparison` result type (Task 1). `UNAVAILABLE_REASONS` and `UnavailableReason`, with `ScanComparison` using them (Task 2). |
| `lib/report/comparison/derive.ts` | modify | `hasUsableEvidence`; `compareScanMetrics` returns `PairComparison` (Task 1). |
| `lib/report/comparison/derive.test.ts` | modify | New derivation cases; existing assertions moved to the new shape (Task 1). |
| `lib/report/comparison/load.ts` | modify | Adapts to `PairComparison` (Task 1). The `reader` parameter, the viewer shortcut and state classification (Task 2). |
| `lib/report/comparison/load.test.ts` | modify | Loader state cases (Task 2). |
| `lib/report/load-report.ts` | modify | Passes `access.kind` as the reader (Task 2). |
| `lib/report/load-report.test.ts` | modify | Viewer and member wiring (Task 2). |
| `lib/report/comparison/copy.ts` | modify | Typed per-reason copy, with the four new strings in three locales (Task 3). |
| `components/report/scan-comparison.test.tsx` | modify | Every reason renders in every locale (Task 3). |
| `e2e/acceptance/report-scan-comparison.spec.ts` | modify | The viewer expects `no_history_access` (Task 4). |
| `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`, `PHASE-3-TEST-RESULTS.md` | modify | Phase record (Task 5). |

`projection.ts`, `components/report/scan-comparison.tsx`, `lib/funnel/report-props.ts` and `lib/report/view-model.ts` need **no** change. Confirm this in Task 5; do not edit them preemptively.

---

### Task 1: `compareScanMetrics` says why

**Files:**
- Modify: `lib/report/comparison/types.ts` (append after `PairChanges`)
- Modify: `lib/report/comparison/derive.ts`
- Modify: `lib/report/comparison/load.ts` (one call site only)
- Test: `lib/report/comparison/derive.test.ts`

This task changes the derivation's return shape and adds two reasons. **The loader's observable behaviour must not change in this task:** it still returns `no_accessible_pair` wherever it did before. Task 2 changes that.

- [ ] **Step 1: Add the result type**

In `lib/report/comparison/types.ts`, directly after the `PairChanges` interface, add:

```ts
/** Why a pair produced (or did not produce) a comparison. */
export type PairComparison =
  | { kind: 'changes'; changes: PairChanges }
  | { kind: 'insufficient_evidence' }
  | { kind: 'not_comparable' };
```

- [ ] **Step 2: Rewrite the derivation tests to the new shape, and add the new cases**

In `lib/report/comparison/derive.test.ts`:

1. Change the import line to:

```ts
import { compareScanMetrics, deriveComparisonInput, hasUsableEvidence } from './derive';
import type { ComparisonInput, PairChanges, QueryFact } from './types';
```

2. Directly after the `input` helper, add:

```ts
/** Unwraps a `changes` result, failing loudly otherwise. */
const changes = (previous: ComparisonInput, current: ComparisonInput): PairChanges => {
  const result = compareScanMetrics(previous, current);
  if (result.kind !== 'changes') throw new Error(`expected changes, got ${result.kind}`);
  return result.changes;
};
const igOnly = (complete: boolean): ComparisonInput =>
  ({ scannedAt: '2026-09-08T00:00:00Z', cohorts: [], ig: { definition: 'stored-post-sample-v1', posts: 3, complete } });
```

3. Replace the whole `describe('compareScanMetrics', …)` block with:

```ts
describe('compareScanMetrics', () => {
  it('compares only the exact common query cohort with one denominator', () => {
    const base = input([fact('q1', 'present'), fact('q2', 'absent')]);
    const head = input([fact('q1', 'absent'), fact('q3', 'present')]);
    const result = changes(base, head);
    expect(result.rows[0]).toMatchObject({ previous: 1, current: 0,
      denominator: 1, deltaPercentagePoints: -100, direction: 'decreased',
      omittedPrevious: 1, omittedCurrent: 1 });
    expect(result.counts).toEqual({ increased: 0, decreased: 1, unchanged: 0 });
  });

  it('preserves genuine zero and is not comparable without a common query', () => {
    expect(changes(input([fact('q', 'absent')]), input([fact('q', 'absent')])).rows[0])
      .toMatchObject({ previous: 0, current: 0, denominator: 1, direction: 'unchanged' });
    expect(compareScanMetrics(input([fact('old', 'present')]), input([fact('new', 'present')])))
      .toEqual({ kind: 'not_comparable' });
  });

  it('reports changed context as not comparable, and incomplete or oversized cohorts as insufficient evidence', () => {
    const changed = input([fact('q', 'present')]);
    changed.cohorts[0].key = 'different';
    expect(compareScanMetrics(input([fact('q', 'present')]), changed)).toEqual({ kind: 'not_comparable' });
    const incomplete = input([fact('q', 'present')]); incomplete.cohorts[0].complete = false;
    expect(compareScanMetrics(incomplete, input([fact('q', 'present')]))).toEqual({ kind: 'insufficient_evidence' });
    expect(compareScanMetrics(input(Array.from({ length: 51 }, (_, i) => fact(`q${i}`, 'present'))),
      input(Array.from({ length: 51 }, (_, i) => fact(`q${i}`, 'present'))))).toEqual({ kind: 'insufficient_evidence' });
  });

  it('defensively folds direct facts and excludes unknown or conflicting duplicates', () => {
    const before = input([
      fact('stable', 'present'), fact('stable', 'present'),
      fact('unknown', 'unknown'), fact('unknown', 'absent'),
      fact('conflict', 'present'), fact('conflict', 'absent'),
    ]);
    const after = input([
      fact('stable', 'absent'), fact('stable', 'absent'),
      fact('unknown', 'absent'), fact('conflict', 'present'),
    ]);
    expect(changes(before, after).rows[0]).toMatchObject({
      previous: 1, current: 0, denominator: 1,
      omittedPrevious: 2, omittedCurrent: 2,
    });
  });

  it('counts the union of cohort keys without a comparable row once', () => {
    const before = input([fact('q', 'present')]);
    const after = input([fact('q', 'present')]);
    after.cohorts[0].key = 'changed-context';
    before.ig = { definition: 'stored-post-sample-v1', posts: 1, complete: true };
    after.ig = { definition: 'stored-post-sample-v1', posts: 2, complete: true };
    expect(changes(before, after)).toMatchObject({
      rows: [], ig: { previous: 1, current: 2, delta: 1 }, unavailableGroups: 2,
    });

    before.cohorts[0].complete = false;
    after.cohorts[0].key = before.cohorts[0].key;
    expect(changes(before, after).unavailableGroups).toBe(1);
  });

  it('supports IG-only complete samples without search direction counts', () => {
    const base: ComparisonInput = { scannedAt: 'old', cohorts: [], ig: { definition: 'stored-post-sample-v1', posts: 0, complete: true } };
    const head: ComparisonInput = { scannedAt: 'new', cohorts: [], ig: { definition: 'stored-post-sample-v1', posts: 4, complete: true } };
    expect(compareScanMetrics(base, head)).toEqual({ kind: 'changes', changes: { previousScannedAt: 'old', currentScannedAt: 'new', rows: [],
      counts: { increased: 0, decreased: 0, unchanged: 0 }, ig: { previous: 0, current: 4, delta: 4 }, unavailableGroups: 0 } });
    head.ig!.complete = false;
    expect(compareScanMetrics(base, head)).toEqual({ kind: 'insufficient_evidence' });
  });

  it('is not comparable when both scans are usable but measured different sources', () => {
    expect(compareScanMetrics(input([fact('q', 'present')]), igOnly(true))).toEqual({ kind: 'not_comparable' });
    expect(compareScanMetrics(igOnly(true), input([fact('q', 'present')]))).toEqual({ kind: 'not_comparable' });
  });

  it('is insufficient evidence when the only shared query is unknown on one side', () => {
    const before = input([fact('shared', 'unknown'), fact('only-before', 'present')]);
    const after = input([fact('shared', 'present')]);
    expect(compareScanMetrics(before, after)).toEqual({ kind: 'insufficient_evidence' });
  });

  it('is insufficient evidence when either scan has no usable evidence at all', () => {
    const empty: ComparisonInput = { scannedAt: '2026-09-08T00:00:00Z', cohorts: [], ig: null };
    expect(compareScanMetrics(empty, input([fact('q', 'present')]))).toEqual({ kind: 'insufficient_evidence' });
    expect(compareScanMetrics(input([fact('q', 'present')]), empty)).toEqual({ kind: 'insufficient_evidence' });
  });
});

describe('hasUsableEvidence', () => {
  it('accepts a complete cohort with a known outcome', () => {
    expect(hasUsableEvidence(input([fact('q', 'absent')]))).toBe(true);
  });

  it('rejects an incomplete cohort', () => {
    const incomplete = input([fact('q', 'present')]); incomplete.cohorts[0].complete = false;
    expect(hasUsableEvidence(incomplete)).toBe(false);
  });

  it('rejects a complete cohort whose facts are all unknown or conflicting', () => {
    expect(hasUsableEvidence(input([fact('u', 'unknown'), fact('c', 'present'), fact('c', 'absent')]))).toBe(false);
  });

  it('rejects a scan with no cohorts and no Instagram sample', () => {
    expect(hasUsableEvidence({ scannedAt: '2026-09-08T00:00:00Z', cohorts: [], ig: null })).toBe(false);
  });

  it('accepts a complete Instagram sample and rejects an incomplete one', () => {
    expect(hasUsableEvidence(igOnly(true))).toBe(true);
    expect(hasUsableEvidence(igOnly(false))).toBe(false);
  });
});
```

4. In the `describe('deriveComparisonInput', …)` block, two existing assertions still use the old shape:
   - In "counts failed and conflicting stored query identities as comparison omissions", change `expect(compareScanMetrics(previous, current)?.rows[0])` to `expect(changes(previous, current).rows[0])`.
   - In "sanitizes and bounds two stored-run contexts through derivation and comparison", change `const changes = compareScanMetrics(previous, current)!;` to `const pair = changes(previous, current);`, then rename every later use of `changes` in that test to `pair`. The test uses it seven times: `changes.rows` ×6 and `JSON.stringify(changes)`. The local name must change, because `changes` is now the helper above.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `corepack pnpm exec vitest run lib/report/comparison/derive.test.ts`

Expected: FAIL. `hasUsableEvidence` is not exported, and the `changes` helper throws `expected changes, got undefined`, because `compareScanMetrics` still returns a bare `PairChanges`.

- [ ] **Step 4: Implement the derivation**

In `lib/report/comparison/derive.ts`:

1. Change the type import to:

```ts
import type { ComparisonInput, MetricChange, PairComparison, QueryCohort, QueryFact } from './types';
```

2. Directly after `foldFacts`, add:

```ts
const IG_DEFINITION = 'stored-post-sample-v1';

/** A scan has something comparable: a complete cohort with a known outcome, or a complete IG sample. */
export function hasUsableEvidence(input: ComparisonInput): boolean {
  if (input.ig?.definition === IG_DEFINITION && input.ig.complete) return true;
  return input.cohorts.some(cohort => cohort.complete && foldFacts(cohort).facts.size > 0);
}

/**
 * The two scans measured something in common: a cohort present on both sides
 * sharing at least one query identity (whatever its outcome), or an IG sample
 * of the same definition on both sides.
 */
function overlaps(previous: ComparisonInput, current: ComparisonInput): boolean {
  if (previous.ig?.definition === IG_DEFINITION && current.ig?.definition === IG_DEFINITION) return true;
  const earlier = new Map(previous.cohorts.map(cohort => [cohort.key, cohort]));
  return current.cohorts.some(cohort => {
    const before = earlier.get(cohort.key);
    if (!before) return false;
    const queries = new Set(before.facts.map(fact => fact.query));
    return cohort.facts.some(fact => queries.has(fact.query));
  });
}
```

3. In `compareScanMetrics`:
   - Change its return type from `PairChanges | null` to `PairComparison`.
   - Replace the two literal occurrences of `'stored-post-sample-v1'` in its `ig` expression with `IG_DEFINITION`.
   - Replace its last two statements (`if (rows.length === 0 && ig === null) return null;` and the final `return { previousScannedAt: … };`) with:

```ts
  if (rows.length === 0 && ig === null) {
    return !hasUsableEvidence(previous) || !hasUsableEvidence(current) || overlaps(previous, current)
      ? { kind: 'insufficient_evidence' }
      : { kind: 'not_comparable' };
  }
  return { kind: 'changes', changes: { previousScannedAt: previous.scannedAt, currentScannedAt: current.scannedAt, rows,
    counts: { increased: rows.filter(row => row.direction === 'increased').length,
      decreased: rows.filter(row => row.direction === 'decreased').length,
      unchanged: rows.filter(row => row.direction === 'unchanged').length }, ig, unavailableGroups } };
```

   Leave `deriveComparisonInput`'s own literal `'stored-post-sample-v1'` as it is: that is the definition being *produced*.
   - Remove `PairChanges` from the type import if TypeScript reports it unused. It is no longer named in `derive.ts`.

4. In `lib/report/comparison/load.ts`, keep behaviour identical by replacing:

```ts
        const changes = compareScanMetrics(previous, input);
        if (changes) return { kind: 'available', changes };
```

with:

```ts
        const result = compareScanMetrics(previous, input);
        if (result.kind === 'changes') return { kind: 'available', changes: result.changes };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `corepack pnpm exec vitest run lib/report/comparison/`

Expected: PASS, including every existing `load.test.ts` case unchanged. Then run the full `corepack pnpm test` and `corepack pnpm typecheck`.

- [ ] **Step 6: Mutation checks**

Each change must make the named test fail. Restore each one afterwards.
1. In `compareScanMetrics`, delete `!hasUsableEvidence(previous) || !hasUsableEvidence(current) || `. "is insufficient evidence when either scan has no usable evidence at all" must fail.
2. Make `overlaps` return `false` unconditionally. "is insufficient evidence when the only shared query is unknown on one side" must fail.
3. In `hasUsableEvidence`, drop `cohort.complete && `. "rejects an incomplete cohort" must fail.
4. In `hasUsableEvidence`, drop `&& input.ig.complete`. "accepts a complete Instagram sample and rejects an incomplete one" must fail.

- [ ] **Step 7: Commit**

```bash
git add lib/report/comparison/types.ts lib/report/comparison/derive.ts lib/report/comparison/derive.test.ts lib/report/comparison/load.ts
```

Commit message: `feat(P3.2): say why a scan pair cannot be compared`

---

### Task 2: Reader-aware states in the loader

**Files:**
- Modify: `lib/report/comparison/types.ts`
- Modify: `lib/report/comparison/load.ts`
- Modify: `lib/report/load-report.ts:157-172`
- Test: `lib/report/comparison/load.test.ts`, `lib/report/load-report.test.ts`

- [ ] **Step 1: Name the reasons**

In `lib/report/comparison/types.ts`, replace the `ScanComparison` type with:

```ts
/** Every reason a comparison can be unavailable. Copy is keyed by exactly these. */
export const UNAVAILABLE_REASONS = [
  'no_history_access', 'no_earlier_scan', 'insufficient_evidence', 'not_comparable',
  'no_accessible_pair', 'missing_location', 'invalid_current_scan', 'lookup_failed', 'history_limit',
] as const;
export type UnavailableReason = typeof UNAVAILABLE_REASONS[number];

export type ScanComparison =
  | { kind: 'available'; changes: PairChanges }
  | { kind: 'unavailable'; reason: UnavailableReason };
```

- [ ] **Step 2: Write the failing loader tests**

In `lib/report/comparison/load.test.ts`:

1. Every existing `loadScanComparison(…)` call gets a fourth argument, `'member'`. There are exactly **12** existing call sites, including those inside the `it.each` bodies, and each is written as `await loadScanComparison(`. Before adding the new tests below, confirm that `grep -c "await loadScanComparison(" lib/report/comparison/load.test.ts` prints `12`, and that each of those calls now passes `'member'`.

2. Two existing expectations change meaning. Update them as follows.
   - In "rejects impossible candidate metadata before authorization", change `{ kind: 'unavailable', reason: 'no_accessible_pair' }` to `{ kind: 'unavailable', reason: 'no_earlier_scan' }`, and rename the test to "treats impossible candidate metadata as no earlier scan, before authorization". An invalid date cannot establish an earlier scan.
   - Keep "returns no accessible pair when all candidates are denied" and "rejects an impossible authorized candidate input before comparison" unchanged. Both correctly stay `no_accessible_pair`: valid candidates existed, but none was authorized with readable input.

3. At the end of the file, add:

```ts
describe('loadScanComparison states', () => {
  const at = (hoursBefore: number) =>
    new Date(Date.parse(currentInput.scannedAt) - hoursBefore * 3_600_000).toISOString();
  const incomplete = (scannedAt: string): ComparisonInput => {
    const value = input(scannedAt);
    value.cohorts[0].complete = false;
    return value;
  };
  const unavailable = (reason: string) => ({ kind: 'unavailable', reason });

  it('gives a viewer the access state without touching history', async () => {
    const comparable = job({ id: 'comparable', completed_at: at(24) });
    const deps = ports([comparable]);
    expect(await loadScanComparison(job(), currentInput, deps, 'viewer')).toEqual(unavailable('no_history_access'));
    expect(deps.list).not.toHaveBeenCalled();
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(deps.readInput).not.toHaveBeenCalled();
  });

  it('gives a viewer the identical state when no history exists', async () => {
    expect(await loadScanComparison(job(), currentInput, ports([]), 'viewer')).toEqual(unavailable('no_history_access'));
  });

  it.each([
    ['no history', []],
    ['only another location and unfinished scans', [
      job({ id: 'other-location', location_id: 'location-2', completed_at: '2026-09-07T12:00:00.000Z' }),
      job({ id: 'unfinished', status: 'collecting', completed_at: '2026-09-06T12:00:00.000Z' }),
    ]],
  ] satisfies Array<[string, PublicReportJob[]]>)('reports no earlier scan to a member with %s', async (_label, candidates) => {
    const deps = ports(candidates);
    expect(await loadScanComparison(job(), currentInput, deps, 'member')).toEqual(unavailable('no_earlier_scan'));
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it('treats staff like members, not viewers', async () => {
    expect(await loadScanComparison(job(), currentInput, ports([]), 'staff')).toEqual(unavailable('no_earlier_scan'));
  });

  it('reports not comparable when every authorized earlier scan measured different searches', async () => {
    const earlier = job({ id: 'earlier', completed_at: at(24) });
    const deps = ports([earlier], undefined, new Map([['earlier', input(earlier.completed_at!, 'different')]]));
    expect(await loadScanComparison(job(), currentInput, deps, 'member')).toEqual(unavailable('not_comparable'));
  });

  it('reports insufficient evidence when an authorized earlier scan overlaps but is incomplete', async () => {
    const earlier = job({ id: 'earlier', completed_at: at(24) });
    const deps = ports([earlier], undefined, new Map([['earlier', incomplete(earlier.completed_at!)]]));
    expect(await loadScanComparison(job(), currentInput, deps, 'member')).toEqual(unavailable('insufficient_evidence'));
  });

  it.each([
    ['newer', 'incomplete', 'different'],
    ['older', 'different', 'incomplete'],
  ] as const)('prefers insufficient evidence over not comparable when the incomplete scan is the %s one', async (_label, newer, older) => {
    const first = job({ id: 'first', completed_at: at(24) });
    const second = job({ id: 'second', completed_at: at(48) });
    const make = (kind: 'incomplete' | 'different', scannedAt: string) =>
      kind === 'incomplete' ? incomplete(scannedAt) : input(scannedAt, 'different');
    const deps = ports([first, second], undefined, new Map([
      ['first', make(newer, first.completed_at!)],
      ['second', make(older, second.completed_at!)],
    ]));
    expect(await loadScanComparison(job(), currentInput, deps, 'member')).toEqual(unavailable('insufficient_evidence'));
    expect(deps.readInput).toHaveBeenCalledTimes(2);
  });

  it('reports insufficient evidence for a current scan without usable evidence, reading no earlier scan', async () => {
    const earlier = job({ id: 'earlier', completed_at: at(24) });
    const deps = ports([earlier]);
    const bare: ComparisonInput = { ...currentInput, cohorts: [] };
    expect(await loadScanComparison(job(), bare, deps, 'member')).toEqual(unavailable('insufficient_evidence'));
    expect(deps.authorize).toHaveBeenCalledWith(earlier);
    expect(deps.readInput).not.toHaveBeenCalled();
  });

  it('still reports no earlier scan for a current scan without usable evidence and no history', async () => {
    const bare: ComparisonInput = { ...currentInput, cohorts: [] };
    expect(await loadScanComparison(job(), bare, ports([]), 'member')).toEqual(unavailable('no_earlier_scan'));
  });

  it('keeps no accessible pair when a current scan without usable evidence has only denied history', async () => {
    const denied = job({ id: 'denied', completed_at: at(24) });
    const bare: ComparisonInput = { ...currentInput, cohorts: [] };
    expect(await loadScanComparison(job(), bare, ports([denied], new Set()), 'member')).toEqual(unavailable('no_accessible_pair'));
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `corepack pnpm exec vitest run lib/report/comparison/load.test.ts`

Expected: FAIL. The new state tests get `no_accessible_pair` where they expect the new reasons. TypeScript may flag the fourth argument at typecheck, but Vitest still runs the tests.

- [ ] **Step 4: Implement the loader**

In `lib/report/comparison/load.ts`:

1. Change the imports to:

```ts
import type { PublicReportJob } from '../store';
import { compareScanMetrics, hasUsableEvidence } from './derive';
import type { ComparisonInput, ScanComparison } from './types';
```

2. Directly before `loadScanComparison`, add:

```ts
/** The access the reader holds on the *current* report. Public readers never reach the comparison. */
export type ComparisonReader = 'viewer' | 'member' | 'staff';
```

3. Replace the whole `loadScanComparison` function with:

```ts
/**
 * Selects the most recent strictly earlier comparable scan of the same location
 * that this reader may open, or says honestly why there is none.
 *
 * A viewer's single-report grant never covers another scan, so a viewer gets a
 * fixed state before any history is listed. Nothing about hidden history, not
 * even whether it exists, can change what a viewer sees. The history-based
 * reasons reach only members and staff, who can already open every scan of the
 * location. Candidates are still authorized one by one, exactly as before.
 */
export async function loadScanComparison(
  current: PublicReportJob,
  input: ComparisonInput,
  ports: ComparisonPorts,
  reader: ComparisonReader,
): Promise<ScanComparison> {
  if (reader === 'viewer') return { kind: 'unavailable', reason: 'no_history_access' };
  const invalid = validateCurrent(current, input);
  if (invalid) return invalid;
  const currentTime = parseTimestamp(current.completed_at!)!;
  const currentUsable = hasUsableEvidence(input);
  let sawValid = false;
  let sawAuthorized = false;
  let sawInsufficient = false;
  const exhausted = (): ScanComparison => ({
    kind: 'unavailable',
    reason: !sawValid ? 'no_earlier_scan'
      : !sawAuthorized ? 'no_accessible_pair'
        : sawInsufficient ? 'insufficient_evidence'
          : 'not_comparable',
  });

  try {
    for (let offset = 0; offset < MAX_CANDIDATES; offset += PAGE_SIZE) {
      const candidates = await ports.list(current.id, offset);
      for (const candidate of candidates.slice(0, PAGE_SIZE)) {
        if (!validCandidate(candidate, current, currentTime)) continue;
        sawValid = true;
        if (!await ports.authorize(candidate)) continue;
        // Nothing on this side can be compared, so no earlier scan's input needs reading.
        if (!currentUsable) return { kind: 'unavailable', reason: 'insufficient_evidence' };
        const previous = await ports.readInput(candidate);
        if (!validTimestamp(previous.scannedAt) || !sameInstant(previous.scannedAt, candidate.completed_at!)) continue;
        sawAuthorized = true;
        const result = compareScanMetrics(previous, input);
        if (result.kind === 'changes') return { kind: 'available', changes: result.changes };
        if (result.kind === 'insufficient_evidence') sawInsufficient = true;
      }
      if (candidates.length < PAGE_SIZE) return exhausted();
    }

    const remaining = await ports.list(current.id, MAX_CANDIDATES);
    return remaining.length > 0 ? { kind: 'unavailable', reason: 'history_limit' } : exhausted();
  } catch {
    return { kind: 'unavailable', reason: 'lookup_failed' };
  }
}
```

4. In `lib/report/load-report.ts`, pass the reader. Change the `loadScanComparison(` call, which starts at about line 157, so that its arguments end with the ports object followed by `access.kind`:

```ts
    const scanComparison = await loadScanComparison(
      job,
      deriveComparisonInput(authorizedJob.raw_data, measured, job.completed_at ?? ""),
      {
        list: (id, offset) => deps.store.readEarlierReportJobs(id, offset),
        authorize: async (candidate) => (await authorizeJob(candidate)).kind !== "public",
        readInput: async (candidate) => {
          const data = await deps.store.readAuthorizedJobData(candidate.id);
          const candidateModules = moduleResults(candidate);
          return deriveComparisonInput(data.raw_data, {
            ig: candidateModules.ig?.status === "measured",
            aeo: candidateModules.aeo?.status === "measured",
          }, candidate.completed_at ?? "");
        },
      },
      access.kind,
    );
```

`access` is already narrowed to `viewer | member | staff` by the `access.kind === "public"` early return above. No cast is needed; if TypeScript asks for one, stop and report it, because that would mean the narrowing is not what this plan assumes.

- [ ] **Step 5: Update the report-loader tests**

In `lib/report/load-report.test.ts`, inside `describe("scan comparison authorization integration", …)`:

1. Replace the whole `it.each([… "current-only viewer token" …])("does not let a %s authorize candidate evidence", …)` test with:

```ts
  it.each([
    ["current-only viewer token", {}],
    ["revoked candidate grant", { revoked_at: new Date().toISOString() }],
    ["expired candidate grant", { expires_at: new Date(Date.now() - 1000).toISOString() }],
  ])("gives a %s the access state without looking up any earlier scan", async (_case, candidateGrantOverrides) => {
    const current = createViewerAccessGrant();
    const candidateGrant = createViewerAccessGrant({
      id: current.grant.id, job_id: "job-previous", token_hash: current.grant.token_hash,
      ...candidateGrantOverrides,
    }).grant;
    const deps = makeLoaderDeps({
      viewerToken: current.viewerToken, grant: current.grant, publicJob: currentJob(),
      earlierJobs: [candidateJob()], authorizedJob: currentData,
      grantsByJob: { "job-1": current.grant, "job-previous": Object.keys(candidateGrantOverrides).length ? candidateGrant : null },
    });

    const model = await deps.loader("slug-1", "en");

    expect(model.access).toBe("viewer");
    expect(model).toHaveProperty("scanComparison", { kind: "unavailable", reason: "no_history_access" });
    expect(deps.readEarlierReportJobs).not.toHaveBeenCalled();
    expect(deps.findViewerGrant).not.toHaveBeenCalledWith("job-previous", expect.anything());
    expect(deps.markViewerGrantUsed).not.toHaveBeenCalledWith("job-previous", expect.anything());
    expect(deps.readAuthorizedJobData).not.toHaveBeenCalledWith("job-previous");
  });
```

2. Keep "authorizes each historical candidate by its own membership before reading private data" as it is. It expects `no_accessible_pair`, which stays correct: a member whose candidate was denied.

3. Directly after "loads a pair when injected membership independently authorizes both jobs", add:

```ts
  it("tells a member there is no earlier scan when the location has none", async () => {
    const membership = { workspaceId: "ws-1", role: "manager" as const };
    const deps = makeLoaderDeps({
      publicJob: currentJob(), earlierJobs: [], authorizedJob: currentData,
      membershipsByJob: { "job-1": membership },
    });

    const model = await deps.loader("slug-1", "en");

    expect(model.access).toBe("member");
    expect(model).toHaveProperty("scanComparison", { kind: "unavailable", reason: "no_earlier_scan" });
  });
```

4. Search the file for any other `reason: "no_accessible_pair"` expectation, for example around line 1002. For each one, decide from the fixture whether the reader is a viewer (→ `no_history_access`), a member with no valid candidates (→ `no_earlier_scan`), or a member whose candidates are all denied (→ stays `no_accessible_pair`). Update the expectation only if the fixture says so. List each one you changed, and why, in your report.

- [ ] **Step 6: Run to verify everything passes**

Run: `corepack pnpm exec vitest run lib/report/`

Expected: PASS. Then run the full `corepack pnpm test` and `corepack pnpm typecheck`.

- [ ] **Step 7: Mutation checks**

Each change must make the named test fail. Restore each one afterwards.
1. Delete the `if (reader === 'viewer') …` line. "gives a viewer the access state without touching history" must fail, and so must the load-report viewer test.
2. In `load-report.ts`, pass `'member'` instead of `access.kind`. The load-report viewer test must fail.
3. Swap the `sawInsufficient` and `not_comparable` branches in `exhausted` (return `not_comparable` when `sawInsufficient`). Both "prefers insufficient evidence …" cases must fail.
4. Delete the `if (!currentUsable) return …` line. "reports insufficient evidence for a current scan without usable evidence, reading no earlier scan" must fail, on its `readInput` assertion.
5. Move `sawValid = true;` to after the `authorize` check. "keeps no accessible pair when a current scan without usable evidence has only denied history" and "returns no accessible pair when all candidates are denied" must fail.

- [ ] **Step 8: Commit**

```bash
git add lib/report/comparison/types.ts lib/report/comparison/load.ts lib/report/comparison/load.test.ts lib/report/load-report.ts lib/report/load-report.test.ts
```

Commit message: `feat(P3.2): honest comparison states, decided from the reader for viewers`

---

### Task 3: Copy for every state, typed per reason

**Files:**
- Modify: `lib/report/comparison/copy.ts`
- Test: `components/report/scan-comparison.test.tsx`

The panel already renders `c.unavailable[comparison.reason]`. Today the copy's type is `Record<string, string>`, so a reason with no copy renders a blank line. After this task it is a type error.

- [ ] **Step 1: Write the failing panel test**

In `components/report/scan-comparison.test.tsx`:

1. Change the two type imports to:

```ts
import type { ReportProps } from "@/lib/funnel/report-props";
import { comparisonCopy } from "@/lib/report/comparison/copy";
import { UNAVAILABLE_REASONS, type MetricChange, type ScanComparison } from "@/lib/report/comparison/types";
```

2. Inside `describe("ScanComparisonPanel", …)`, after "renders neutral unavailable and partial cohort explanations", add:

```ts
  it.each(["en", "zh-HK", "zh-TW"] as const)("renders every unavailable reason in %s, never claiming a first scan", (locale) => {
    for (const reason of UNAVAILABLE_REASONS) {
      const text = markup(report({ kind: "unavailable", reason }, locale)).querySelector("p")?.textContent ?? "";
      expect(text, `${locale} ${reason}`).toBe(comparisonCopy[locale].unavailable[reason]);
      expect(text.trim().length, `${locale} ${reason}`).toBeGreaterThan(0);
      expect(text, `${locale} ${reason}`).not.toMatch(/first scan|首次|第一次/i);
    }
  });

  it("tells a viewer how to get history, and the others why there is none", () => {
    const text = (reason: (typeof UNAVAILABLE_REASONS)[number]) =>
      markup(report({ kind: "unavailable", reason })).querySelector("p")?.textContent ?? "";
    expect(text("no_history_access")).toContain("Sign in as the business owner");
    expect(text("no_earlier_scan")).toContain("no earlier finished scan");
    expect(text("insufficient_evidence")).toContain("enough complete evidence");
    expect(text("not_comparable")).toContain("different searches, settings or sources");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run components/report/scan-comparison.test.tsx`

Expected: FAIL. The four new reasons render as empty text (`expected '' to be undefined` or a length of 0).

- [ ] **Step 3: Add the copy and type it per reason**

In `lib/report/comparison/copy.ts`:

1. Add, below the existing import:

```ts
import type { UnavailableReason } from "./types";
```

2. In each locale's `unavailable: { … }` object, add these four keys in front of `no_accessible_pair`. Keep every existing key and string exactly as it is.
   - **`en`:**
     ```ts
     no_history_access: "Comparing with earlier scans needs workspace access. Sign in as the business owner to see changes over time.", no_earlier_scan: "There is no earlier finished scan of this location to compare with yet.", insufficient_evidence: "An earlier scan exists, but one of the two didn't collect enough complete evidence to compare. A rescan with fuller coverage may make a comparison possible.", not_comparable: "Earlier scans checked different searches, settings or sources, so a like-for-like comparison isn't possible.",
     ```
   - **`zh-HK`:**
     ```ts
     no_history_access: "與較早的掃描比較需要工作台權限。請以商戶負責人身分登入，查看隨時間的變化。", no_earlier_scan: "此地點暫時未有較早而已完成的掃描可供比較。", insufficient_evidence: "已有較早的掃描，但其中一次未有收集到足夠完整的證據作比較。覆蓋較全面的重新掃描或可進行比較。", not_comparable: "較早的掃描檢查了不同的搜尋、設定或來源，因此無法作同等比較。",
     ```
   - **`zh-TW`:**
     ```ts
     no_history_access: "與較早的掃描比較需要工作台權限。請以店家負責人身分登入，查看隨時間的變化。", no_earlier_scan: "此據點目前還沒有較早且已完成的掃描可供比較。", insufficient_evidence: "已有較早的掃描，但其中一次沒有收集到足夠完整的證據來比較。涵蓋更完整的重新掃描或許能進行比較。", not_comparable: "較早的掃描檢查的是不同的搜尋、設定或來源，因此無法進行同基準比較。",
     ```

3. In the `satisfies Record<PrototypeLocale, { … }>` clause at the bottom, change `unavailable: Record<string, string>;` to:

```ts
  omitted: string; unavailableGroups: string; unavailable: Record<UnavailableReason, string>;
```

This replaces the existing line containing `omitted: string; unavailableGroups: string; unavailable: Record<string, string>;`.

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm exec vitest run components/report/scan-comparison.test.tsx`

Expected: PASS. Then run the full `corepack pnpm test` and `corepack pnpm typecheck`.

- [ ] **Step 5: Mutation checks**

Each change must make the named check fail. Restore each one afterwards.
1. Delete the `zh-TW` `not_comparable` entry. `corepack pnpm typecheck` must fail on `copy.ts`: this proves the per-reason typing. The panel test must fail too.
2. Change the `en` `no_earlier_scan` text to "This is the first scan of this location." "renders every unavailable reason in en, never claiming a first scan" must fail.

- [ ] **Step 6: Commit**

```bash
git add lib/report/comparison/copy.ts components/report/scan-comparison.test.tsx
```

Commit message: `feat(P3.2): trilingual copy for each comparison state, one per reason`

---

### Task 4: The acceptance route expects the viewer state

**Files:**
- Modify: `e2e/acceptance/report-scan-comparison.spec.ts:79`

This suite needs a production build, which this Windows machine cannot produce: the standing Turbopack/radix-ui blocker. It runs in CI (`.github/workflows/ci.yml` runs `pnpm e2e:acceptance`). Here it is typechecked only.

- [ ] **Step 1: Change the expectation**

Replace:

```ts
    await expect(panel).toContainText(comparisonCopy[locale].unavailable.no_accessible_pair);
```

with:

```ts
    await expect(panel).toContainText(comparisonCopy[locale].unavailable.no_history_access);
```

Also change the test title's ending from `shows unavailable after current-only unlock` to `shows the access state after current-only unlock`. Change nothing else. The privacy assertions (`assertHistoricalPrivate`, `assertRscPrivate`) stay exactly as they are: they prove the viewer's HTML and RSC payload still carry no earlier-scan data.

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm typecheck`

Expected: exit 0. Then run the full `corepack pnpm test`, which does not include Playwright.

- [ ] **Step 3: Commit**

```bash
git add e2e/acceptance/report-scan-comparison.spec.ts
```

Commit message: `test(P3.2): acceptance route expects the viewer access state`

---

### Task 5: Gates and the phase record

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md` (append a section)
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md` (append a section)

- [ ] **Step 1: Confirm the untouched files really needed no change**

Run: `git diff --stat origin/main -- lib/report/comparison/projection.ts components/report/scan-comparison.tsx lib/funnel/report-props.ts lib/report/view-model.ts packages neon/migrations`

Expected: empty output.

- [ ] **Step 2: Run every gate, one at a time, recording exact output and exit codes**

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:integration
corepack pnpm build
```

Expected results:
- `typecheck`: 0.
- `lint`: 0, with 30 warnings and 0 errors.
- `test` and `test:integration`: 0. Record their counts against the P3.4 record's final numbers: unit 323 files / 3,414 tests, integration 30 files / 323 tests. Explain the unit delta by file. The integration count should not change.
- `build`: expected to be **blocked** by the standing Turbopack/radix-ui cascade. Record it as blocked, not failed. Then run `npx next build --webpack` separately as a labelled diagnostic and record that outcome too.

`e2e` and `e2e:acceptance` are **not run** locally, because they need a production build. Record that, and say that CI runs them.

If a run shows an unrelated flaky failure, re-run it once and record both results.

- [ ] **Step 3: Append the phase record**

Add a `## P3.2c — honest comparison states` section to both documents. Match the structure and status vocabulary of the existing P3.2 / P3.2b / P3.4 sections: passed / failed / blocked / not run, and implemented / locally verified / hosted verified. It must include:
1. The branch, HEAD and base (`main` at `073c4ae`), and a link to the spec.
2. What this closes: the P3.2 record's third "does not prove" item, the conflated `no_accessible_pair`.
3. The states table as built, and the privacy argument: a viewer's state is reader-derived. Cite the loader test proving no port is called, and the load-report test proving `readEarlierReportJobs` and `findViewerGrant` are never called for the earlier job.
4. The two spec amendments made during planning: "or sources" in the `not_comparable` copy, and the copy typed per reason.
5. Every test changed, with the reason: the three changed expectations in Task 2, and every `no_accessible_pair` expectation you examined in `load-report.test.ts`.
6. The mutation checks from Tasks 1–3, each with what you observed.
7. Every gate, with its exact command, exit code and counts.
8. **What this does not prove:**
   - that the successful-pair browser artifact exists (it still needs hosted access);
   - that the acceptance route was run locally (it runs in CI only);
   - that the Chinese copy was reviewed by a native speaker (it follows the repository register rules: 香港書面中文 for zh-HK, 台灣用語 for zh-TW, 工作台 as the workspace term).

- [ ] **Step 4: Commit**

```bash
git add docs/implementation/owner-platform-v1/PHASE-3-REPORT.md docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md
```

Commit message: `docs(P3.2): record the honest comparison states slice`

---

## Added 2026-09-25: Tasks 6–8, from the whole-branch review

The review found that the report page never resolved membership. The member-only states were therefore unreachable in production, and the viewer copy's "sign in" promise could not be kept. The owner approved wiring membership in on this branch. Read the spec's "Amendment (2026-09-25)" section first.

### Task 6: The report page resolves workspace membership

**Files:**
- Modify: `lib/auth.ts` (add `reportMembershipResolver` after `authorizeWorkspaceRequest`)
- Test: `lib/auth.test.ts` (new `describe` block)
- Modify: `app/[locale]/r/[slug]/page.tsx:33`
- Create: `app/[locale]/r/[slug]/page.test.tsx`

- [ ] **Step 1: Write the failing resolver tests**

Append to `lib/auth.test.ts`. First read its existing mocks (`vi.mock("@/lib/repositories/membership", …)`, `@/lib/identity/*`) and reuse them where they fit. The resolver takes injectable dependencies, so these tests pass fakes directly and do not depend on those mocks.

```ts
describe("reportMembershipResolver", () => {
  const user = { id: "user-1", email: "owner@example.test" };
  const row = (role: "owner" | "manager" | "viewer") => ({ workspace_id: "ws-1", role });

  it("returns nothing for a job attached to no workspace, without asking who is signed in", async () => {
    const getUser = vi.fn(async () => user);
    const accepted = vi.fn(async () => row("owner"));
    const resolve = reportMembershipResolver({ getUser, accepted });
    expect(await resolve({ id: "job-1", workspaceId: null })).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
    expect(accepted).not.toHaveBeenCalled();
  });

  it("returns nothing when nobody is signed in", async () => {
    const accepted = vi.fn(async () => row("owner"));
    const resolve = reportMembershipResolver({ getUser: async () => null, accepted });
    expect(await resolve({ id: "job-1", workspaceId: "ws-1" })).toBeNull();
    expect(accepted).not.toHaveBeenCalled();
  });

  it("returns nothing for a signed-in user without an accepted membership", async () => {
    const resolve = reportMembershipResolver({ getUser: async () => user, accepted: async () => null });
    expect(await resolve({ id: "job-1", workspaceId: "ws-1" })).toBeNull();
  });

  it.each(["owner", "manager", "viewer"] as const)("returns an accepted %s membership for the job's workspace", async (role) => {
    const accepted = vi.fn(async () => row(role));
    const resolve = reportMembershipResolver({ getUser: async () => user, accepted });
    expect(await resolve({ id: "job-1", workspaceId: "ws-1" })).toEqual({ workspaceId: "ws-1", role });
    expect(accepted).toHaveBeenCalledWith("user-1", "ws-1");
  });

  it("answers every job of one workspace identically, with one user lookup and one query", async () => {
    const getUser = vi.fn(async () => user);
    const accepted = vi.fn(async () => row("manager"));
    const resolve = reportMembershipResolver({ getUser, accepted });
    const answers = await Promise.all(["job-1", "job-2", "job-3"].map(id => resolve({ id, workspaceId: "ws-1" })));
    expect(answers).toEqual([1, 2, 3].map(() => ({ workspaceId: "ws-1", role: "manager" })));
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(accepted).toHaveBeenCalledTimes(1);
  });

  it("fails closed to no membership, with a fixed log line, when identity or the query fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const identityDown = reportMembershipResolver({ getUser: async () => { throw new Error("identity secret detail"); }, accepted: async () => row("owner") });
      expect(await identityDown({ id: "job-1", workspaceId: "ws-1" })).toBeNull();
      const queryDown = reportMembershipResolver({ getUser: async () => user, accepted: async () => { throw new Error("db secret detail"); } });
      expect(await queryDown({ id: "job-1", workspaceId: "ws-1" })).toBeNull();
      expect(error).toHaveBeenCalledWith("[report] membership_unavailable", { category: "report_membership_unavailable" });
      expect(JSON.stringify(error.mock.calls)).not.toContain("secret detail");
    } finally {
      error.mockRestore();
    }
  });
});
```

Add `reportMembershipResolver` to the file's existing import from `./auth` (or `@/lib/auth`, whichever the file uses).

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run lib/auth.test.ts`

Expected: FAIL, because `reportMembershipResolver` is not exported.

- [ ] **Step 3: Implement the resolver**

In `lib/auth.ts`, directly after `authorizeWorkspaceRequest`, add:

```ts
type AcceptedMembershipRow = { workspace_id: string; role: WorkspaceRole };
type ReportMembership = { workspaceId: string; role: WorkspaceRole };

/**
 * The report page's membership resolver, for loadReport's `getMembership`
 * option (CLAUDE.md §3.2.2: an accepted member sees the full report).
 *
 * Keyed by workspace, never by job: every job of one workspace gets the same
 * answer. The scan comparison's privacy argument depends on that. A per-job
 * answer would let "no accessible pair" versus "no earlier scan" reveal a scan
 * the reader cannot open (docs/superpowers/specs/2026-09-24-comparison-states-design.md).
 *
 * No location-scope check: every member may read evidence (§3.9).
 * authorizeReport still rejects a membership naming a different workspace.
 *
 * The page is public, so any identity or database failure degrades to "no
 * membership" (the public or viewer view), never to an error or more access.
 * One user lookup per render and one query per workspace, however many earlier
 * scans the comparison walks.
 */
export function reportMembershipResolver(deps: {
  getUser?: () => Promise<SessionUser | null>;
  accepted?: (userId: string, workspaceId: string) => Promise<AcceptedMembershipRow | null>;
} = {}): (job: { id: string; workspaceId: string | null }) => Promise<ReportMembership | null> {
  const resolveUser = deps.getUser ?? getUser;
  const accepted = deps.accepted ?? loadAcceptedMembership;
  let user: Promise<SessionUser | null> | undefined;
  const byWorkspace = new Map<string, Promise<ReportMembership | null>>();
  return async (job) => {
    if (!job.workspaceId) return null;
    const workspaceId = job.workspaceId;
    try {
      user ??= resolveUser();
      const current = await user;
      if (!current) return null;
      let lookup = byWorkspace.get(workspaceId);
      if (!lookup) {
        lookup = accepted(current.id, workspaceId).then(row => row ? { workspaceId: row.workspace_id, role: row.role } : null);
        byWorkspace.set(workspaceId, lookup);
      }
      return await lookup;
    } catch {
      console.error("[report] membership_unavailable", { category: "report_membership_unavailable" });
      return null;
    }
  };
}
```

`SessionUser`, `WorkspaceRole`, `getUser` and `loadAcceptedMembership` already exist in this file. If `loadAcceptedMembership`'s row type is not assignable to `AcceptedMembershipRow`, stop and report the actual type; do not cast. Once a rejected promise is memoised, every later call for that workspace also returns `null`, which keeps the answer the same across jobs.

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm exec vitest run lib/auth.test.ts`

Expected: PASS.

- [ ] **Step 5: Wire the page, test-first**

1. Read `app/[locale]/r/[slug]/page.tsx` in full.
2. Create `app/[locale]/r/[slug]/page.test.tsx`. It must prove that the page calls `loadReport(slug, locale, { getMembership })` with a function supplied by `reportMembershipResolver`. Do it this way:
   - `vi.mock("@/lib/report/load-report")` with a `loadReport` spy.
   - `vi.mock("@/lib/auth")` so that `reportMembershipResolver` returns a known sentinel function.
   - Mock whatever else the page imports that would otherwise touch the network or `next/headers`, following the patterns in nearby page tests (`grep -rl "page.test" app`).
   - Invoke the page's default export with `params` and `searchParams` as it expects.
   - Assert `expect(loadReport).toHaveBeenCalledWith("the-slug", <normalised locale>, { getMembership: sentinel })`.
   The test must fail before the page change.
3. Change `page.tsx:33` to:

```ts
  const model = await loadReport(slug, locale, { getMembership: reportMembershipResolver() });
```

   and add `import { reportMembershipResolver } from "@/lib/auth";`. The page is a server component and `lib/auth.ts` is server-side; if Next or the lint rules object to the import, stop and report it.

- [ ] **Step 6: Run the tests, then the full gates**

Run: `corepack pnpm exec vitest run lib/auth.test.ts "app/[locale]/r/[slug]/page.test.tsx"`. Expected: PASS.

Then run the full `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint` (30 warnings / 0 errors) and `corepack pnpm test:integration`. Integration is required here because this touches the session path.

- [ ] **Step 7: Mutation checks**

1. Key the memo by `job.id` instead of `workspaceId` → "answers every job of one workspace identically, with one user lookup and one query" must fail.
2. Remove the `try`/`catch` → "fails closed to no membership…" must fail.
3. Drop `if (!job.workspaceId) return null;` → "returns nothing for a job attached to no workspace…" must fail.
4. Revert `page.tsx:33` to `loadReport(slug, locale)` → the page test must fail.

- [ ] **Step 8: Commit**

```bash
git add lib/auth.ts lib/auth.test.ts "app/[locale]/r/[slug]/page.tsx" "app/[locale]/r/[slug]/page.test.tsx"
```

Commit message: `feat(P3.2): the report page recognises accepted workspace members`

---

### Task 7: Review follow-ups

**Files:**
- Test: `lib/report/comparison/derive.test.ts`
- Modify: `lib/report/comparison/copy.ts` (zh-HK `no_history_access` only)

- [ ] **Step 1: Test the Instagram branch of `overlaps`**

In `derive.test.ts`, inside `describe('compareScanMetrics', …)`, add:

```ts
  it('is insufficient evidence when both have an Instagram sample, one incomplete, and their searches differ', () => {
    const before: ComparisonInput = { ...input([fact('q', 'present')]), ig: { definition: 'stored-post-sample-v1', posts: 3, complete: true } };
    const after: ComparisonInput = { ...input([fact('other', 'present')]), ig: { definition: 'stored-post-sample-v1', posts: 4, complete: false } };
    expect(compareScanMetrics(before, after)).toEqual({ kind: 'insufficient_evidence' });
  });
```

Here the search cohorts share a key but no query, so only the Instagram samples overlap. **Mutation check:** delete the IG line at the top of `overlaps` in `derive.ts` and confirm that this test fails (with `not_comparable`). Then restore.

- [ ] **Step 2: zh-HK spelling**

In `copy.ts`, zh-HK `no_history_access`, change `身分` to `身份`. `lib/copy.ts` uses 身份 for zh-HK. Leave zh-TW's `身分` as it is, because 身分 is the Taiwan form. Run the panel test.

- [ ] **Step 3: Gates and commit**

Run the full `corepack pnpm test` and `corepack pnpm typecheck`.

```bash
git add lib/report/comparison/derive.test.ts lib/report/comparison/copy.ts
```

Commit message: `test(P3.2): cover the Instagram overlap branch; zh-HK 身份`

---

### Task 8: Correct the phase record

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`, `PHASE-3-TEST-RESULTS.md` (the P3.2c sections, plus the P3.2 note on the membership-resolution bullet)

- [ ] **Step 1: Re-run the gates**

Re-run every gate at the new HEAD, one at a time: `typecheck`, `lint`, `test`, `test:integration`, `build` (blocked, plus the `--webpack` diagnostic).

- [ ] **Step 2: Amend the P3.2c sections**

1. Add a "Whole-branch review and membership wiring" subsection. Cover:
   - the review's finding: page.tsx never passed `getMembership`, so the member states were unreachable and the viewer copy overpromised;
   - the owner's decision to wire membership in;
   - the resolver's design: keyed by workspace, memoised, fails closed;
   - its tests and mutation checks.
2. Correct the "Reachable by" wording: members reach the states **once signed in on `/r/[slug]`, as of Task 6**.
3. Fix the header: HEAD, commit list and counts.
4. Fix the "A precise definition, as built" note, since the spec now says "authorized with readable input".
5. In the P3.2 section, correct the claim that "membership resolution through `loadReport`" was already satisfied: the loader accepted a resolver, but the page never supplied one. Keep the original text visible and add a dated correction note, as the P3.4 section does.
6. In `OWNER-WORKSPACE-GAP-OBSERVATIONS.md`, next to the finding that notes the missing `getMembership` page wiring, add a short dated note that P3.2c wired the resolver. The owner-surface link to `/r/[slug]` remains open.
7. Record the accepted limitation (oversized overlap copy) and the M1 invariant.
8. **What this does not prove:**
   - a member sign-in and full report in a browser (hosted auth is needed);
   - the successful-pair browser artifact;
   - the acceptance route (CI only);
   - a native-speaker review of the copy.

- [ ] **Step 3: Commit**

```bash
git add docs/implementation/owner-platform-v1
```

Commit message: `docs(P3.2): record membership wiring and the whole-branch review`

---

## Verification checklist

- [ ] A viewer gets `no_history_access`, and no history port (list, authorize, read) is called: proven in `load.test.ts` and `load-report.test.ts`.
- [ ] A viewer's result is identical with and without earlier scans.
- [ ] A member gets `no_earlier_scan`, `insufficient_evidence` and `not_comparable`, each in the situation the spec defines.
- [ ] `insufficient_evidence` outranks `not_comparable` whichever candidate is newer.
- [ ] A current scan without usable evidence reads no earlier scan's input.
- [ ] All-denied history still gives `no_accessible_pair`; `history_limit` and `lookup_failed` are unchanged.
- [ ] Every reason has copy in en, zh-HK and zh-TW, enforced by the type, and none claims a first scan.
- [ ] Public and locked reports still carry no comparison data (existing tests unchanged and green).
- [ ] `packages/**`, the migrations, the projection and the panel component are unchanged.
- [ ] Every mutation check failed its named test.
- [ ] `/r/[slug]` passes a membership resolver; a signed-in accepted member gets member access (Task 6 page and resolver tests).
- [ ] The resolver answers per workspace, memoised, and fails closed to `null` with a fixed log line.
- [ ] The Instagram branch of `overlaps` has a test that fails without it (Task 7).
