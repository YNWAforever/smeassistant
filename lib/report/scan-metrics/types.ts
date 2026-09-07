export type Exclusion =
  | 'unknown'
  | 'failed'
  | 'unsupported'
  | 'no_answer'
  | 'conflict'
  | 'unidentified';

export interface Coverage {
  inspected: number;
  duplicates: number;
  excluded: Record<Exclusion, number>;
  truncated: boolean;
  evidenceTruncated: boolean;
}

export interface IgObservation {
  identity: string | null;
  postedAt: string | null;
  likes: number | null;
  comments: number | null;
  ambiguousZero: boolean;
}

export interface IgSample {
  distinctPosts: number;
  datedPosts: number;
  earliest: string | null;
  latest: string | null;
  engagement: 'unavailable_historical_counts';
  coverage: Coverage;
  observations: IgObservation[];
}

export interface SearchObservation {
  query: string;
  observedAt: string | null;
  outcome: 'present' | 'absent' | Exclusion;
}

export interface SearchMetric {
  engine: string;
  queryType: string | null;
  context: string;
  surface: 'organic' | 'maps' | 'ai';
  numerator: number;
  denominator: number;
  state: 'measured' | 'unavailable';
  coverage: Coverage;
  observations: SearchObservation[];
}

export interface ScanMetrics {
  instagram: IgSample | null;
  search: SearchMetric[];
  omittedSearchGroups: number;
}

export const MAX_INPUT_RECORDS = 1000;
export const MAX_EVIDENCE_ROWS = 50;
export const MAX_SEARCH_GROUPS = 50;
