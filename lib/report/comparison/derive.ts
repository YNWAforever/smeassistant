import { deriveInstagramSample } from '../scan-metrics/instagram';
import { deriveComparisonSearchCohorts } from '../scan-metrics/search';
import { MAX_EVIDENCE_ROWS } from '../scan-metrics/types';
import type { ComparisonInput, MetricChange, PairChanges, QueryCohort } from './types';

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

function comparableRow(previous: QueryCohort, current: QueryCohort, rowIndex: number): MetricChange | null {
  if (!previous.complete || !current.complete) return null;
  const previousFacts = new Map(previous.facts.map(item => [item.query, item]));
  const currentFacts = new Map(current.facts.map(item => [item.query, item]));
  const queries = previous.facts.map(item => item.query).filter(query => currentFacts.has(query));
  if (queries.length === 0 || queries.length > MAX_EVIDENCE_ROWS) return null;
  let previousCount = 0; let currentCount = 0;
  const evidence = queries.map(query => {
    const before = previousFacts.get(query)!; const after = currentFacts.get(query)!;
    const previousPresent = before.outcome === 'present'; const currentPresent = after.outcome === 'present';
    if (previousPresent) previousCount++; if (currentPresent) currentCount++;
    return { query: query.replace(/https?:\/\/\S+/gi, '[url]').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500),
      previous: previousPresent, current: currentPresent,
      previousObservedAt: before.observedAt, currentObservedAt: after.observedAt };
  });
  const difference = currentCount - previousCount;
  return { key: `comparison-${rowIndex + 1}`, engine: current.engine, surface: current.surface,
    previous: previousCount, current: currentCount, denominator: queries.length,
    deltaPercentagePoints: 100 * difference / queries.length,
    direction: difference > 0 ? 'increased' : difference < 0 ? 'decreased' : 'unchanged',
    evidence, omittedPrevious: previous.facts.length - queries.length, omittedCurrent: current.facts.length - queries.length };
}

export function compareScanMetrics(previous: ComparisonInput, current: ComparisonInput): PairChanges | null {
  const previousGroups = new Map(previous.cohorts.map(group => [group.key, group]));
  const rows: MetricChange[] = []; let unavailableGroups = 0;
  for (const group of current.cohorts) {
    const before = previousGroups.get(group.key);
    if (!before) continue;
    const row = comparableRow(before, group, rows.length);
    if (row) rows.push(row); else unavailableGroups++;
  }
  const ig = previous.ig?.definition === 'stored-post-sample-v1' && current.ig?.definition === 'stored-post-sample-v1'
    && previous.ig.complete && current.ig.complete
    ? { previous: previous.ig.posts, current: current.ig.posts, delta: current.ig.posts - previous.ig.posts } : null;
  if (rows.length === 0 && ig === null) return null;
  return { previousScannedAt: previous.scannedAt, currentScannedAt: current.scannedAt, rows,
    counts: { increased: rows.filter(row => row.direction === 'increased').length,
      decreased: rows.filter(row => row.direction === 'decreased').length,
      unchanged: rows.filter(row => row.direction === 'unchanged').length }, ig, unavailableGroups };
}
