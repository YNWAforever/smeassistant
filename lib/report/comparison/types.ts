export interface QueryFact {
  query: string;
  observedAt: string | null;
  outcome: 'present' | 'absent' | 'unknown';
}

export interface QueryCohort {
  key: string;
  engine: string;
  surface: 'organic' | 'maps' | 'ai';
  label: string;
  queryType: string;
  gl: string;
  hl: string;
  location: string;
  device: string;
  ll: string | null;
  facts: QueryFact[];
  complete: boolean;
}

export interface ComparisonInput {
  scannedAt: string;
  cohorts: QueryCohort[];
  ig: { definition: 'stored-post-sample-v1'; posts: number; complete: boolean } | null;
}

export interface MetricChange {
  key: string;
  engine: string;
  surface: 'organic' | 'maps' | 'ai';
  queryType: string;
  gl: string;
  hl: string;
  location: string;
  device: string;
  ll: string | null;
  previous: number;
  current: number;
  denominator: number;
  deltaPercentagePoints: number;
  direction: 'increased' | 'decreased' | 'unchanged';
  evidence: Array<{ query: string; previous: boolean; current: boolean;
    previousObservedAt: string | null; currentObservedAt: string | null }>;
  omittedPrevious: number;
  omittedCurrent: number;
}

export interface PairChanges {
  previousScannedAt: string;
  currentScannedAt: string;
  rows: MetricChange[];
  counts: { increased: number; decreased: number; unchanged: number };
  ig: { previous: number; current: number; delta: number } | null;
  unavailableGroups: number;
}

export type ScanComparison =
  | { kind: 'available'; changes: PairChanges }
  | { kind: 'unavailable'; reason: 'no_accessible_pair' | 'missing_location'
      | 'invalid_current_scan' | 'lookup_failed' | 'history_limit' };
