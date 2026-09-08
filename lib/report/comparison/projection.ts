import type { ScanComparison } from './types';

/** Keep bounded-history cardinality private outside the comparison selector. */
export function projectScanComparison(comparison: ScanComparison): ScanComparison {
  return comparison.kind === 'unavailable' && comparison.reason === 'history_limit'
    ? { kind: 'unavailable', reason: 'no_accessible_pair' }
    : comparison;
}