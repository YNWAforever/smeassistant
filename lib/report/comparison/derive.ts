import { deriveInstagramSample } from '../scan-metrics/instagram';
import { deriveComparisonSearchCohorts } from '../scan-metrics/search';
import { MAX_EVIDENCE_ROWS } from '../scan-metrics/types';
import type { ComparisonInput, MetricChange, PairChanges, QueryCohort, QueryFact } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function deriveComparisonInput(rawData: unknown, measured: { ig: boolean; aeo: boolean }, scannedAt: string): ComparisonInput {
  const raw = asRecord(rawData);
  const sample = measured.ig ? deriveInstagramSample(raw.ig) : null;
  return { scannedAt, cohorts: measured.aeo ? deriveComparisonSearchCohorts(raw.aeo) : [],
    ig: sample === null ? null : { definition: 'stored-post-sample-v1', posts: sample.distinctPosts,
      complete: !sample.coverage.truncated && sample.coverage.excluded.unidentified === 0 } };
}

function foldFacts(cohort: QueryCohort): { facts: Map<string, QueryFact>; total: number } {
  const grouped = new Map<string, QueryFact[]>();
  for (const fact of cohort.facts) {
    const entries = grouped.get(fact.query) ?? [];
    entries.push(fact);
    grouped.set(fact.query, entries);
  }
  const facts = new Map<string, QueryFact>();
  for (const [query, entries] of grouped) {
    const outcomes = new Set(entries.map(entry => entry.outcome));
    if (outcomes.size !== 1 || outcomes.has('unknown')) continue;
    const timestamps = new Set(entries.map(entry => entry.observedAt));
    facts.set(query, { query, outcome: entries[0].outcome,
      observedAt: timestamps.size === 1 ? entries[0].observedAt : null });
  }
  return { facts, total: grouped.size };
}

function comparableRow(previous: QueryCohort, current: QueryCohort, rowIndex: number): MetricChange | null {
  if (!previous.complete || !current.complete) return null;
  const before = foldFacts(previous);
  const after = foldFacts(current);
  const queries = [...before.facts.keys()].filter(query => after.facts.has(query));
  if (queries.length === 0 || queries.length > MAX_EVIDENCE_ROWS) return null;
  let previousCount = 0; let currentCount = 0;
  const evidence = queries.map(query => {
    const previousFact = before.facts.get(query)!; const currentFact = after.facts.get(query)!;
    const previousPresent = previousFact.outcome === 'present'; const currentPresent = currentFact.outcome === 'present';
    if (previousPresent) previousCount++; if (currentPresent) currentCount++;
    return { query: query.replace(/https?:\/\/\S+/gi, '[url]').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500),
      previous: previousPresent, current: currentPresent,
      previousObservedAt: previousFact.observedAt, currentObservedAt: currentFact.observedAt };
  });
  const difference = currentCount - previousCount;
  return { key: `comparison-${rowIndex + 1}`, engine: current.engine, surface: current.surface,
    previous: previousCount, current: currentCount, denominator: queries.length,
    deltaPercentagePoints: 100 * difference / queries.length,
    direction: difference > 0 ? 'increased' : difference < 0 ? 'decreased' : 'unchanged',
    evidence, omittedPrevious: before.total - queries.length, omittedCurrent: after.total - queries.length };
}
export function compareScanMetrics(previous: ComparisonInput, current: ComparisonInput): PairChanges | null {
  const previousGroups = new Map(previous.cohorts.map(group => [group.key, group]));
  const currentGroups = new Map(current.cohorts.map(group => [group.key, group]));
  const cohortKeys = new Set([...previousGroups.keys(), ...currentGroups.keys()]);
  const rows: MetricChange[] = [];
  const comparableKeys = new Set<string>();
  for (const group of currentGroups.values()) {
    const before = previousGroups.get(group.key);
    if (!before) continue;
    const row = comparableRow(before, group, rows.length);
    if (row) {
      rows.push(row);
      comparableKeys.add(group.key);
    }
  }
  const unavailableGroups = cohortKeys.size - comparableKeys.size;
  const ig = previous.ig?.definition === 'stored-post-sample-v1' && current.ig?.definition === 'stored-post-sample-v1'
    && previous.ig.complete && current.ig.complete
    ? { previous: previous.ig.posts, current: current.ig.posts, delta: current.ig.posts - previous.ig.posts } : null;
  if (rows.length === 0 && ig === null) return null;
  return { previousScannedAt: previous.scannedAt, currentScannedAt: current.scannedAt, rows,
    counts: { increased: rows.filter(row => row.direction === 'increased').length,
      decreased: rows.filter(row => row.direction === 'decreased').length,
      unchanged: rows.filter(row => row.direction === 'unchanged').length }, ig, unavailableGroups };
}
