import type { PublicReportJob } from '../store';
import { compareScanMetrics } from './derive';
import type { ComparisonInput, ScanComparison } from './types';

const PAGE_SIZE = 25;
const MAX_CANDIDATES = 1000;
const finishedStatuses = new Set(['done', 'partial']);

export interface ComparisonPorts {
  list: (jobId: string, offset: number) => Promise<PublicReportJob[]>;
  authorize: (candidate: PublicReportJob) => Promise<boolean>;
  readInput: (candidate: PublicReportJob) => Promise<ComparisonInput>;
}

function validTimestamp(value: string | null | undefined): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function validateCurrent(current: PublicReportJob, input: ComparisonInput): ScanComparison | null {
  if (!current.location_id) return { kind: 'unavailable', reason: 'missing_location' };
  if (!current.workspace_id || !finishedStatuses.has(current.status) || !validTimestamp(current.completed_at)
    || !validTimestamp(input.scannedAt) || !sameInstant(current.completed_at, input.scannedAt)) {
    return { kind: 'unavailable', reason: 'invalid_current_scan' };
  }
  return null;
}

function validCandidate(candidate: PublicReportJob, current: PublicReportJob, currentTime: number): boolean {
  return candidate.workspace_id === current.workspace_id
    && candidate.location_id === current.location_id
    && finishedStatuses.has(candidate.status)
    && validTimestamp(candidate.completed_at)
    && Date.parse(candidate.completed_at) < currentTime;
}

export async function loadScanComparison(
  current: PublicReportJob,
  input: ComparisonInput,
  ports: ComparisonPorts,
): Promise<ScanComparison> {
  const invalid = validateCurrent(current, input);
  if (invalid) return invalid;
  const currentTime = Date.parse(current.completed_at!);

  try {
    for (let offset = 0; offset < MAX_CANDIDATES; offset += PAGE_SIZE) {
      const candidates = await ports.list(current.id, offset);
      for (const candidate of candidates.slice(0, PAGE_SIZE)) {
        if (!validCandidate(candidate, current, currentTime)) continue;
        if (!await ports.authorize(candidate)) continue;
        const previous = await ports.readInput(candidate);
        if (!validTimestamp(previous.scannedAt) || !sameInstant(previous.scannedAt, candidate.completed_at!)) continue;
        const changes = compareScanMetrics(previous, input);
        if (changes) return { kind: 'available', changes };
      }
      if (candidates.length < PAGE_SIZE) return { kind: 'unavailable', reason: 'no_accessible_pair' };
    }

    const remaining = await ports.list(current.id, MAX_CANDIDATES);
    return { kind: 'unavailable', reason: remaining.length > 0 ? 'history_limit' : 'no_accessible_pair' };
  } catch {
    return { kind: 'unavailable', reason: 'lookup_failed' };
  }
}