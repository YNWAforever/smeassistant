import type { PublicReportJob } from '../store';
import { compareScanMetrics, hasUsableEvidence } from './derive';
import type { ComparisonInput, ScanComparison } from './types';

const PAGE_SIZE = 25;
const MAX_CANDIDATES = 1000;
const finishedStatuses = new Set(['done', 'partial']);

export interface ComparisonPorts {
  list: (jobId: string, offset: number) => Promise<PublicReportJob[]>;
  authorize: (candidate: PublicReportJob) => Promise<boolean>;
  readInput: (candidate: PublicReportJob) => Promise<ComparisonInput>;
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}(?::?\d{2})?)$/;

function parseTimestamp(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const match = TIMESTAMP.exec(value);
  if (!match) return null;

  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;

  const zone = match[7];
  if (zone !== 'Z') {
    const zoneParts = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(zone);
    if (!zoneParts || Number(zoneParts[2]) > 23 || Number(zoneParts[3] ?? 0) > 59) return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function validTimestamp(value: string | null | undefined): value is string {
  return parseTimestamp(value) !== null;
}

function sameInstant(left: string, right: string): boolean {
  return parseTimestamp(left) === parseTimestamp(right);
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
    && parseTimestamp(candidate.completed_at)! < currentTime;
}

/** The access the reader holds on the *current* report. Public readers never reach the comparison. */
export type ComparisonReader = 'viewer' | 'member' | 'staff';

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