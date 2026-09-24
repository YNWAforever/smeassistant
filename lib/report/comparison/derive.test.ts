import { describe, expect, it } from 'vitest';
import { compareScanMetrics, deriveComparisonInput, hasUsableEvidence } from './derive';
import type { ComparisonInput, PairChanges, QueryFact } from './types';

const fact = (query: string, outcome: QueryFact['outcome']): QueryFact =>
  ({ query, outcome, observedAt: null });
const input = (facts: QueryFact[]): ComparisonInput => ({
  scannedAt: '2026-09-08T00:00:00Z', ig: null,
  cohorts: [{ key: JSON.stringify(['google', 'discovery', 'hk', 'en',
    'Hong Kong', 'desktop', null, 'organic']), engine: 'google',
    surface: 'organic', label: 'Hong Kong', queryType: 'discovery', gl: 'hk', hl: 'en', location: 'Hong Kong', device: 'desktop', ll: null, facts, complete: true }],
});

/** Unwraps a `changes` result, failing loudly otherwise. */
const changes = (previous: ComparisonInput, current: ComparisonInput): PairChanges => {
  const result = compareScanMetrics(previous, current);
  if (result.kind !== 'changes') throw new Error(`expected changes, got ${result.kind}`);
  return result.changes;
};
const igOnly = (complete: boolean): ComparisonInput =>
  ({ scannedAt: '2026-09-08T00:00:00Z', cohorts: [], ig: { definition: 'stored-post-sample-v1', posts: 3, complete } });

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

  it('is insufficient evidence when both have an Instagram sample, one incomplete, and their searches differ', () => {
    const before: ComparisonInput = { ...input([fact('q', 'present')]), ig: { definition: 'stored-post-sample-v1', posts: 3, complete: true } };
    const after: ComparisonInput = { ...input([fact('other', 'present')]), ig: { definition: 'stored-post-sample-v1', posts: 4, complete: false } };
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

describe('deriveComparisonInput', () => {
  const run = (id: string, overrides: Record<string, unknown> = {}) => ({ id, query: 'fixture cafe', query_type: 'discovery', engine: 'google_maps',
    requested_at: '2026-09-08T00:00:00Z', serpapi: { status: 'Success' },
    settings: { gl: 'hk', hl: 'en', location: 'Hong Kong', device: 'desktop', ll: null },
    merchant_presence: { maps_rank: null, found: false, confidence: 'none' }, raw_refs: { maps_results: [{ title: 'Other' }] }, ...overrides });

  it('uses measured module gates and keeps exact long query identity', () => {
    const prefix = 'x'.repeat(500);
    const result = deriveComparisonInput({ ig: { posts: [{ id: 'p' }] }, aeo: { merchant_performance: { runs: [
      run('a', { query: `${prefix}a` }), run('b', { query: `${prefix}b` }),
    ] } } }, { ig: true, aeo: true }, 'scan');
    expect(result.ig).toEqual({ definition: 'stored-post-sample-v1', posts: 1, complete: true });
    expect(result.cohorts[0].facts.map(row => row.query)).toEqual([`${prefix}a`, `${prefix}b`]);
    expect(deriveComparisonInput({ ig: { posts: [{ id: 'stale' }] } }, { ig: false, aeo: false }, 'scan'))
      .toEqual({ scannedAt: 'scan', cohorts: [], ig: null });
  });

  it('requires complete settings and folds duplicates without cherry-picking timestamps', () => {
    const result = deriveComparisonInput({ aeo: { merchant_performance: { runs: [
      run('a'), run('b', { requested_at: '2026-09-09T00:00:00Z' }),
      run('missing', { query: 'excluded', settings: { gl: 'hk', hl: 'en', location: null, device: 'desktop', ll: null } }),
    ] } } }, { ig: false, aeo: true }, 'scan');
    expect(result.cohorts[0].facts).toEqual([{ query: 'fixture cafe', outcome: 'absent', observedAt: null }]);
  });

  it('retains conflicting or unknown repeated queries as unknown facts', () => {
    const result = deriveComparisonInput({ aeo: { merchant_performance: { runs: [
      run('a'), run('b', { merchant_presence: { maps_rank: 1 } }),
      run('c', { query: 'unknown', raw_refs: {} }), run('d', { query: 'unknown' }),
    ] } } }, { ig: false, aeo: true }, 'scan');
    expect(result.cohorts[0].facts).toEqual([
      { query: 'fixture cafe', outcome: 'unknown', observedAt: null },
      { query: 'unknown', outcome: 'unknown', observedAt: null },
    ]);
  });

  it('counts failed and conflicting stored query identities as comparison omissions', () => {
    const previous = deriveComparisonInput({ aeo: { merchant_performance: { runs: [
      run('previous-q1', { query: 'q1', merchant_presence: { maps_rank: 1 } }),
      run('previous-q2', { query: 'q2', serpapi: { status: 'Error', error: 'provider failed' } }),
    ] } } }, { ig: false, aeo: true }, 'previous');
    const current = deriveComparisonInput({ aeo: { merchant_performance: { runs: [
      run('current-q1', { query: 'q1', merchant_presence: { maps_rank: 1 } }),
      run('current-q2', { query: 'q2' }),
      run('current-q2', { query: 'q2', merchant_presence: { maps_rank: 1 } }),
    ] } } }, { ig: false, aeo: true }, 'current');

    expect(changes(previous, current).rows[0]).toMatchObject({
      previous: 1, current: 1, denominator: 1, deltaPercentagePoints: 0,
      direction: 'unchanged', omittedPrevious: 1, omittedCurrent: 1,
    });
  });

  it('withholds cohorts affected by input, group, or evidence bounds', () => {
    const many = Array.from({ length: 1001 }, (_, i) => run(String(i), { query: `q${i}` }));
    expect(deriveComparisonInput({ aeo: { merchant_performance: { runs: many } } }, { ig: false, aeo: true }, 'scan').cohorts[0].complete).toBe(false);
    const groups = Array.from({ length: 51 }, (_, i) => run(String(i), { query_type: `type${i}` }));
    const output = deriveComparisonInput({ aeo: { merchant_performance: { runs: groups } } }, { ig: false, aeo: true }, 'scan');
    expect(output.cohorts).toHaveLength(50);
    expect(output.cohorts.every(group => !group.complete)).toBe(true);
    const evidence = Array.from({ length: 51 }, (_, i) => run(String(i), { query: `q${i}` }));
    expect(deriveComparisonInput({ aeo: { merchant_performance: { runs: evidence } } }, { ig: false, aeo: true }, 'scan').cohorts[0].complete).toBe(false);
  });


  it('sanitizes and bounds two stored-run contexts through derivation and comparison', () => {
    const unsafeLocation = `Hong\u0000 Kong https://secret.example/${'x'.repeat(240)}`;
    const longLocation = 'L'.repeat(240);
    const previous = deriveComparisonInput({ aeo: { merchant_performance: { runs: [
      run('old-a', { settings: { gl: 'hk', hl: 'en', location: unsafeLocation, device: 'desktop', ll: '22.3,114.2' } }),
      run('old-b', { settings: { gl: 'hk', hl: 'zh-HK', location: longLocation, device: 'mobile', ll: null } }),
    ] } } }, { ig: false, aeo: true }, '2026-08-01T00:00:00Z');
    const current = deriveComparisonInput({ aeo: { merchant_performance: { runs: [
      run('new-a', { settings: { gl: 'hk', hl: 'en', location: unsafeLocation, device: 'desktop', ll: '22.3,114.2' } }),
      run('new-b', { settings: { gl: 'hk', hl: 'zh-HK', location: longLocation, device: 'mobile', ll: null } }),
    ] } } }, { ig: false, aeo: true }, '2026-09-01T00:00:00Z');
    const pair = changes(previous, current);
    expect(pair.rows).toHaveLength(2);
    expect(pair.rows.map(row => row.location)).toEqual(expect.arrayContaining(['Hong  Kong [url]', 'L'.repeat(200)]));
    expect(pair.rows.every(row => row.location.length <= 200)).toBe(true);
    expect(pair.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ hl: 'en', device: 'desktop', ll: '22.3,114.2' }),
      expect.objectContaining({ hl: 'zh-HK', device: 'mobile', ll: null }),
    ]));
    expect(JSON.stringify(pair)).not.toContain('secret.example');
    expect(pair.rows.map(row => row.key)).toEqual(['comparison-1', 'comparison-2']);
    expect(pair.rows.every(row => /^comparison-\d+$/.test(row.key))).toBe(true);
  });
  it('keeps historical organic ambiguity unknown', () => {
    const result = deriveComparisonInput({ aeo: { merchant_performance: { runs: [run('organic', {
      engine: 'google', merchant_presence: { organic_rank: null, found: true, confidence: 'high' },
      raw_refs: { organic_results: [{ title: 'Other' }] },
    })] } } }, { ig: false, aeo: true }, 'scan');
    expect(result.cohorts.find(group => group.surface === 'organic')?.facts).toEqual([
      { query: 'fixture cafe', outcome: 'unknown', observedAt: '2026-09-08T00:00:00.000Z' },
    ]);
  });
});
