import { describe, expect, it } from 'vitest';
import { deriveScanMetrics } from './derive';

const raw = {
  ig: { posts: Array.from({ length: 60 }, (_, i) => ({ id: String(i), like_count: 0 })) },
  aeo: { merchant_performance: { runs: [{
    id: 'one', query: 'PRIVATE_METRICS_QUERY', engine: 'google_maps',
    serpapi: { status: 'Success' }, merchant_presence: { maps_rank: 1 },
  }] } },
};

describe('deriveScanMetrics', () => {
  it('suppresses stale raw data for unmeasured modules', () => {
    expect(deriveScanMetrics({ ig: { posts: [{ id: 'private' }] } },
      { ig: false, aeo: false })).toEqual({ instagram: null, search: [], omittedSearchGroups: 0 });
  });
  it.each([null, undefined, [], 'bad', 42, {}, { ig: {}, aeo: { merchant_performance: { runs: 'bad' } } }])(
    'handles absent and malformed raw data: %j', (value) => {
      expect(deriveScanMetrics(value, { ig: true, aeo: true })).toEqual({ instagram: null, search: [], omittedSearchGroups: 0 });
    },
  );
  it('derives totals before evidence truncation and sanitizes supporting data', () => {
    const result = deriveScanMetrics(raw, { ig: true, aeo: true });
    expect(result.instagram).toMatchObject({ distinctPosts: 60, engagement: 'unavailable_historical_counts' });
    expect(result.instagram?.observations).toHaveLength(50);
    expect(result.search[0]).toMatchObject({ numerator: 1, denominator: 1 });
    expect(result.search[0].observations[0].query).toBe('PRIVATE_METRICS_QUERY');
  });
  it('guards IG and AEO independently', () => {
    expect(deriveScanMetrics(raw, { ig: false, aeo: true }).instagram).toBeNull();
    expect(deriveScanMetrics(raw, { ig: true, aeo: false }).search).toEqual([]);
  });
  it('carries omitted group disclosure', () => {
    const runs = Array.from({ length: 55 }, (_, i) => ({
      ...raw.aeo.merchant_performance.runs[0], id: String(i), query_type: String(i),
    }));
    const result = deriveScanMetrics({ aeo: { merchant_performance: { runs } } }, { ig: false, aeo: true });
    expect(result.search).toHaveLength(50);
    expect(result.omittedSearchGroups).toBe(5);
  });
});
