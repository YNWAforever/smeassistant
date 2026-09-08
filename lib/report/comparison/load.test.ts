import { describe, expect, it, vi } from 'vitest';
import { loadScanComparison, type ComparisonPorts } from './load';
import type { ComparisonInput } from './types';
import type { PublicReportJob } from '../store';

const currentInput: ComparisonInput = {
  scannedAt: '2026-09-08T12:00:00.000Z',
  cohorts: [{ key: 'same', engine: 'google', surface: 'organic', label: 'Google', queryType: 'discovery', gl: 'hk', hl: 'en', location: 'Hong Kong', device: 'desktop', ll: null, complete: true,
    facts: [{ query: 'bakery', observedAt: '2026-09-08T12:00:00.000Z', outcome: 'present' }] }],
  ig: null,
};

function job(overrides: Partial<PublicReportJob> = {}): PublicReportJob {
  return {
    id: 'current', share_slug: 'current', business_name: 'Current', district: null, industry: null,
    status: 'done', overall_score: null, module_scores: null, module_results: null,
    score_coverage: null, region: 'hk', scoring_version: null,
    workspace_id: 'workspace-1', location_id: 'location-1', completed_at: currentInput.scannedAt,
    ...overrides,
  };
}

function input(scannedAt: string, key = 'same'): ComparisonInput {
  return {
    scannedAt,
    cohorts: [{ key, engine: 'google', surface: 'organic', label: 'Google', queryType: 'discovery', gl: 'hk', hl: 'en', location: 'Hong Kong', device: 'desktop', ll: null, complete: true,
      facts: [{ query: 'bakery', observedAt: scannedAt, outcome: 'absent' }] }],
    ig: null,
  };
}

function ports(candidates: PublicReportJob[], allowed = new Set(candidates.map(candidate => candidate.id)),
  inputs = new Map(candidates.map(candidate => [candidate.id, input(candidate.completed_at!)]))): ComparisonPorts & {
    list: ReturnType<typeof vi.fn>; authorize: ReturnType<typeof vi.fn>; readInput: ReturnType<typeof vi.fn>;
  } {
  return {
    list: vi.fn(async (_jobId: string, offset: number) => candidates.slice(offset, offset + 25)),
    authorize: vi.fn(async candidate => allowed.has(candidate.id)),
    readInput: vi.fn(async candidate => inputs.get(candidate.id)!),
  };
}

describe('loadScanComparison', () => {
  it('skips denied evidence and selects the next authorized comparable scan', async () => {
    const denied = job({ id: 'denied', completed_at: '2026-09-07T12:00:00.000Z' });
    const accepted = job({ id: 'accepted', completed_at: '2026-09-06T12:00:00.000Z' });
    const deps = ports([denied, accepted], new Set(['accepted']));

    const result = await loadScanComparison(job(), currentInput, deps);

    expect(result).toMatchObject({ kind: 'available', changes: {
      previousScannedAt: '2026-09-06T12:00:00.000Z',
      currentScannedAt: currentInput.scannedAt,
      rows: [{ evidence: [{ query: 'bakery', previous: false, current: true }] }],
    } });
    expect(deps.readInput).toHaveBeenCalledTimes(1);
    expect(deps.readInput).toHaveBeenCalledWith(accepted);
  });

  it('returns no accessible pair when all candidates are denied', async () => {
    const candidates = [job({ id: 'a', completed_at: '2026-09-07T12:00:00Z' })];
    expect(await loadScanComparison(job(), currentInput, ports(candidates, new Set()))).toEqual(
      { kind: 'unavailable', reason: 'no_accessible_pair' },
    );
  });

  it.each([
    ['missing location', job({ location_id: null }), 'missing_location'],
    ['missing workspace', job({ workspace_id: null }), 'invalid_current_scan'],
    ['unfinished current scan', job({ status: 'collecting' }), 'invalid_current_scan'],
    ['invalid current timestamp', job({ completed_at: 'invalid' }), 'invalid_current_scan'],
    ['incomplete current input', job(), 'invalid_current_scan', { ...currentInput, scannedAt: 'invalid' }],
  ] satisfies Array<[string, PublicReportJob, string, ComparisonInput?]>)('rejects %s before listing history', async (_label, current, reason, suppliedInput = currentInput) => {
    const deps = ports([]);
    expect(await loadScanComparison(current, suppliedInput, deps)).toEqual({ kind: 'unavailable', reason });
    expect(deps.list).not.toHaveBeenCalled();
  });

  it.each([
    ['current metadata', job({ completed_at: '2026-02-31T12:00:00Z' }), { ...currentInput, scannedAt: '2026-03-03T12:00:00Z' }],
    ['current input', job({ completed_at: '2026-03-03T12:00:00Z' }), { ...currentInput, scannedAt: '2026-02-31T12:00:00Z' }],
  ] satisfies Array<[string, PublicReportJob, ComparisonInput]>)('rejects impossible calendar dates in %s before history lookup', async (_label, current, suppliedInput) => {
    const deps = ports([]);
    expect(await loadScanComparison(current, suppliedInput, deps)).toEqual(
      { kind: 'unavailable', reason: 'invalid_current_scan' },
    );
    expect(deps.list).not.toHaveBeenCalled();
  });

  it('rejects impossible candidate metadata before authorization', async () => {
    const impossible = job({ id: 'impossible', completed_at: '2026-02-31T12:00:00Z' });
    const deps = ports([impossible]);
    expect(await loadScanComparison(job(), currentInput, deps)).toEqual(
      { kind: 'unavailable', reason: 'no_accessible_pair' },
    );
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(deps.readInput).not.toHaveBeenCalled();
  });

  it('rejects an impossible authorized candidate input before comparison', async () => {
    const candidate = job({ id: 'candidate', completed_at: '2026-03-03T12:00:00Z' });
    const deps = ports([candidate], undefined, new Map([
      ['candidate', input('2026-02-31T12:00:00Z')],
    ]));
    expect(await loadScanComparison(job(), currentInput, deps)).toEqual(
      { kind: 'unavailable', reason: 'no_accessible_pair' },
    );
    expect(deps.authorize).toHaveBeenCalledWith(candidate);
    expect(deps.readInput).toHaveBeenCalledWith(candidate);
  });

  it.each([
    ['PostgreSQL timestamp text', '2026-09-08 12:00:00.123456+00', '2026-09-07 12:00:00.654321+00'],
    ['valid leap day', '2028-02-29T12:00:00Z', '2028-02-28T12:00:00Z'],
    ['ISO timezone offsets', '2026-09-08T20:00:00+08:00', '2026-09-07T20:00:00+08:00'],
  ])('accepts %s', async (_label, currentTimestamp, previousTimestamp) => {
    const current = job({ completed_at: currentTimestamp });
    const suppliedInput = { ...currentInput, scannedAt: currentTimestamp };
    const candidate = job({ id: 'candidate', completed_at: previousTimestamp });
    const deps = ports([candidate], undefined, new Map([['candidate', input(previousTimestamp)]]));
    expect((await loadScanComparison(current, suppliedInput, deps)).kind).toBe('available');
  });
  it('rechecks injected rows and considers only valid same-location earlier completed candidates', async () => {
    const rows = [
      job({ id: 'cross-location', location_id: 'location-2', completed_at: '2026-09-07T12:00:00Z' }),
      job({ id: 'invalid-time', completed_at: 'invalid' }),
      job({ id: 'same-time', completed_at: currentInput.scannedAt }),
      job({ id: 'unfinished', status: 'collecting', completed_at: '2026-09-05T12:00:00Z' }),
      job({ id: 'valid', completed_at: '2026-09-04T12:00:00Z' }),
    ];
    const deps = ports(rows);
    const result = await loadScanComparison(job(), currentInput, deps);
    expect(result.kind).toBe('available');
    expect(deps.authorize).toHaveBeenCalledTimes(1);
    expect(deps.authorize).toHaveBeenCalledWith(rows[4]);
  });

  it('continues past an authorized scan with no common metrics', async () => {
    const first = job({ id: 'first', completed_at: '2026-09-07T12:00:00Z' });
    const second = job({ id: 'second', completed_at: '2026-09-06T12:00:00Z' });
    const deps = ports([first, second], undefined, new Map([
      ['first', input(first.completed_at!, 'different')],
      ['second', input(second.completed_at!)],
    ]));
    const result = await loadScanComparison(job(), currentInput, deps);
    expect(result).toMatchObject({ kind: 'available', changes: { previousScannedAt: second.completed_at } });
    expect(deps.readInput).toHaveBeenCalledTimes(2);
  });

  it('contains thrown failures as lookup_failed', async () => {
    const deps = ports([]);
    deps.list.mockRejectedValueOnce(new Error('secret database message'));
    expect(await loadScanComparison(job(), currentInput, deps)).toEqual({ kind: 'unavailable', reason: 'lookup_failed' });
  });

  it('stops at 1000 candidates and uses one metadata-only page to report history_limit', async () => {
    const candidates = Array.from({ length: 1001 }, (_, index) =>
      job({ id: `candidate-${index}`, completed_at: new Date(Date.parse(currentInput.scannedAt) - (index + 1) * 1000).toISOString() }));
    const deps = ports(candidates, new Set());
    expect(await loadScanComparison(job(), currentInput, deps)).toEqual({ kind: 'unavailable', reason: 'history_limit' });
    expect(deps.list).toHaveBeenLastCalledWith('current', 1000);
    expect(deps.authorize).toHaveBeenCalledTimes(1000);
    expect(deps.readInput).not.toHaveBeenCalled();
  });

  it('reports exhaustion after exactly 1000 denied candidates', async () => {
    const candidates = Array.from({ length: 1000 }, (_, index) =>
      job({ id: `candidate-${index}`, completed_at: new Date(Date.parse(currentInput.scannedAt) - (index + 1) * 1000).toISOString() }));
    const deps = ports(candidates, new Set());
    expect(await loadScanComparison(job(), currentInput, deps)).toEqual({ kind: 'unavailable', reason: 'no_accessible_pair' });
    expect(deps.list).toHaveBeenLastCalledWith('current', 1000);
  });
});