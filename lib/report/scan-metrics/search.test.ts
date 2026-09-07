import { describe, expect, it } from 'vitest';
import { deriveSearchMetrics } from './search';

const run = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, query: 'fixture cafe', query_type: 'discovery', engine: 'google_maps',
  serpapi: { status: 'Success', error: null },
  settings: { gl: 'hk', hl: 'en', location: null, ll: null, device: 'desktop' },
  merchant_presence: { maps_rank: null, found: false, confidence: 'none' },
  raw_refs: { maps_results: [{ title: 'Another cafe', position: 1 }] },
  ...overrides,
});
const derive = (runs: unknown[]) => deriveSearchMetrics({ merchant_performance: { runs } });

it('does not count a failed query as absence', () => {
  const result = derive([run('failed', { serpapi: { status: 'Error', error: 'fixture failure' } })]);
  expect(result.groups[0]).toMatchObject({ surface: 'maps', numerator: 0, denominator: 0, state: 'unavailable' });
  expect(result.groups[0].coverage.excluded.failed).toBe(1);
});

describe('stored observation denominators', () => {
  it('keeps organic, Maps, and AI eligibility separate', () => {
    const result = derive([
      run('o1', { engine: 'google', merchant_presence: { organic_rank: 1, ai_mentioned: true }, raw_refs: { ai_overview_triggered: true, ai_overview_text: 'Cafe answer' } }),
      run('o2', { engine: 'google', merchant_presence: { organic_rank: null, found: false, ai_mentioned: false }, raw_refs: { organic_results: [{ title: 'Other', position: 1 }] } }),
      run('m1'), run('m2'),
    ]);
    expect(result.groups.map(g => [g.surface, g.numerator, g.denominator])).toEqual([['organic', 1, 2], ['ai', 1, 1], ['maps', 0, 2]]);
    expect(result.groups[1].coverage.excluded.no_answer).toBe(1);
  });

  it.each([
    [{ serpapi: {} }, 'unknown'],
    [{ serpapi: { status: 'Success', error: 'Failure' } }, 'failed'],
    [{ serpapi: { status: 'Success', error: 'Engine is not supported' } }, 'unsupported'],
    [{ raw_refs: {} }, 'unknown'],
    [{ raw_refs: { maps_results: [] } }, 'unknown'],
    [{ raw_refs: { maps_results: [{}] } }, 'unknown'],
    [{ raw_refs: { organic_results: [{ title: 'Other' }] } }, 'unknown'],
    [{ merchant_presence: { maps_rank: 1.5 } }, 'unknown'],
    [{ merchant_presence: { local_pack_rank: 1 }, raw_refs: {} }, 'unknown'],
    [{ merchant_presence: { maps_rank: null, found: true, confidence: 'low' } }, 'unknown'],
    [{ merchant_presence: null }, 'unknown'],
    [{ available: true, serpapi: undefined }, 'unknown'],
    [{ engine: 'bing' }, 'unsupported'],
  ])('excludes unproven records: %j', (override, reason) => {
    const group = derive([run('case', override)]).groups[0];
    expect(group.denominator).toBe(0);
    expect(group.coverage.excluded[reason as 'unknown']).toBe(1);
  });

  it('accepts only positive safe integer ranks after success', () => {
    const records = [1, 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'].map((rank, i) => run(String(i), { merchant_presence: { maps_rank: rank } }));
    expect(derive(records).groups[0]).toMatchObject({ numerator: 1, denominator: 1 });
  });

  it('uses matching surface snippets as proof and never local-pack proof for Maps', () => {
    const result = derive([
      run('yes', { raw_refs: {}, evidence_snippets: [{ source: 'maps', text: 'Other cafe' }] }),
      run('no', { raw_refs: {}, evidence_snippets: [{ source: 'local_pack', text: 'Other cafe' }] }),
    ]).groups[0];
    expect(result.denominator).toBe(1);
    expect(result.coverage.excluded.unknown).toBe(1);
  });

  it('requires an answer plus an explicit boolean mention for AI', () => {
    const ai = (id: string, overrides = {}) => run(id, { engine: 'google_ai_mode', merchant_presence: { ai_mentioned: false }, raw_refs: { ai_mode_markdown: 'Answer' }, ...overrides });
    const group = derive([
      ai('true', { merchant_presence: { ai_mentioned: true } }), ai('false'),
      ai('unknown', { merchant_presence: { found: true, confidence: 'high', ai_cited: true } }),
      ai('empty', { raw_refs: { ai_mode_markdown: ' ' } }),
      ai('refs', { raw_refs: { ai_references: [{ link: 'https://example.test' }] } }),
      ai('badrefs', { raw_refs: { ai_references: [{}] } }),
      ai('failed', { serpapi: { status: 'Error' }, raw_refs: {} }),
    ]).groups[0];
    expect(group).toMatchObject({ numerator: 1, denominator: 3 });
    expect(group.coverage.excluded).toMatchObject({ unknown: 1, no_answer: 2, failed: 1 });
  });

  it('requires the explicit overview trigger for Google and supports overview answer engines', () => {
    const groups = derive([
      run('google', { engine: 'google', merchant_presence: { ai_mentioned: true }, raw_refs: { ai_overview_text: 'Answer' } }),
      run('overview', { engine: 'google_ai_overview', merchant_presence: { ai_mentioned: false }, raw_refs: { ai_overview_text: 'Answer' } }),
    ]).groups;
    expect(groups.find(g => g.engine === 'google' && g.surface === 'ai')?.denominator).toBe(0);
    expect(groups.find(g => g.engine === 'google_ai_overview')?.denominator).toBe(1);
  });
});

describe('identity, legacy data, and bounded presentation', () => {
  it('deduplicates repeated evidence and excludes contradictory duplicates', () => {
    const result = derive([run('same'), run('same'), run('conflict'), run('conflict', { merchant_presence: { maps_rank: 2 } })]).groups[0];
    expect(result).toMatchObject({ numerator: 0, denominator: 1 });
    expect(result.coverage).toMatchObject({ inspected: 4, duplicates: 2, excluded: { conflict: 1 } });
    expect(result.observations).toHaveLength(2);
  });

  it('excludes every group affected by a stable ID collision', () => {
    const groups = derive([run('same'), run('same', { engine: 'google', query: 'Different query', merchant_presence: { organic_rank: 1 } })]).groups;
    expect(groups).toHaveLength(3);
    for (const group of groups) {
      expect(group.denominator).toBe(0);
      expect(group.coverage.excluded.conflict).toBe(1);
    }
  });

  it('separates contexts and query types and uses complete fallback identity', () => {
    const groups = derive([
      run('same'), run('same', { settings: { gl: 'tw', hl: 'zh-TW' } }),
      run('other', { query_type: 'brand' }),
      run('', { requested_at: '2026-09-01T00:00:00Z' }), run('', { requested_at: '2026-09-02T00:00:00Z' }),
      run('', { requested_at: '2026-09-02T00:00:00Z' }),
    ]).groups;
    expect(groups).toHaveLength(3);
    expect(groups[0].denominator).toBe(3);
    expect(groups[0].coverage.duplicates).toBe(1);
  });

  it('does not manufacture a date and does not expose provider metadata', () => {
    const output = derive([run('SECRET-ID', { serpapi: { status: 'Success', search_id: 'SECRET-SEARCH', error: null }, raw_refs: { maps_results: [{ title: 'Other', link: 'https://serpapi.com/search?api_key=SECRET' }] } })]);
    expect(output.groups[0].observations[0].observedAt).toBeNull();
    expect(JSON.stringify(output)).not.toContain('SECRET');
    expect(JSON.stringify(output)).not.toContain('serpapi.com');
  });

  it('rejects impossible observation calendar days while preserving valid leap days', () => {
    const output = derive([
      run('impossible-day', { requested_at: '2026-02-30T00:00:00Z' }),
      run('leap-day', { requested_at: '2024-02-29T00:00:00Z' }),
    ]);

    expect(output.groups[0].observations.map((row) => row.observedAt)).toEqual([
      null,
      '2024-02-29T00:00:00.000Z',
    ]);
  });

  it('uses legacy only without merchant runs and requires explicit availability', () => {
    const legacy = { query: 'Legacy', engine: 'google', brand_organic_rank: 2, ai_overview_mentioned: true };
    expect(deriveSearchMetrics({ serpapi_runs: [legacy] }).groups[0].denominator).toBe(0);
    expect(deriveSearchMetrics({ serpapi_runs: [{ ...legacy, available: true }] }).groups[0].denominator).toBe(1);
    expect(deriveSearchMetrics({ merchant_performance: { runs: [] }, serpapi_runs: [{ ...legacy, available: true }] }).groups).toEqual([]);
    expect(deriveSearchMetrics({ merchant_performance: { runs: 'bad' }, serpapi_runs: [{ ...legacy, available: true }] }).groups).toEqual([]);
  });

  it('legacy AI needs retained answer and boolean in the corresponding answer object', () => {
    const groups = deriveSearchMetrics({ serpapi_runs: [
      { query: 'old', engine: 'google_ai_mode', available: true, ai_mode_mentioned: true },
      { query: 'proved', engine: 'google_ai_mode', available: true, ai_mode: { text: 'Answer', brand_mentioned: false } },
    ] }).groups;
    expect(groups[0]).toMatchObject({ numerator: 0, denominator: 1 });
    expect(groups[0].coverage.excluded.no_answer).toBe(1);
  });

  it('counts beyond six and limits evidence independently from inspected inputs', () => {
    const group = derive(Array.from({ length: 1001 }, (_, i) => run(String(i)))).groups[0];
    expect(group.denominator).toBe(1000);
    expect(group.observations).toHaveLength(50);
    expect(group.coverage).toMatchObject({ inspected: 1000, truncated: true, evidenceTruncated: true });
  });

  it('discloses omitted groups and bounds query/context values without collapsing identity', () => {
    const result = derive(Array.from({ length: 55 }, (_, i) => run(String(i), { settings: { location: 'a'.repeat(300) + i }, query: 'q'.repeat(1000) })));
    expect(result.groups).toHaveLength(50);
    expect(result.omittedGroups).toBe(5);
    expect(result.groups[0].observations[0].query.length).toBeLessThanOrEqual(500);
    expect(result.groups[0].context.length).toBeLessThan(1600);
  });

  it('accepts unknown containers without throwing', () => {
    for (const input of [null, [], 1, {}, { merchant_performance: { runs: [null, 1, {}] } }]) {
      expect(() => deriveSearchMetrics(input)).not.toThrow();
    }
  });
});

it('treats missing engine and mixed legacy surface schemas as unknown', () => {
  expect(derive([{}]).groups[0].coverage.excluded.unknown).toBe(1);
  const result = deriveSearchMetrics({ serpapi_runs: [{ query: 'mixed', engine: 'google_maps', available: true, brand_organic_rank: 1 }] });
  expect(result.groups[0].denominator).toBe(0);
  expect(result.groups[0].coverage.excluded.unknown).toBe(1);
});

it('documents indistinguishable organic fuzzy and unmatched evidence under an AI citation match', async () => {
  // Exercise the pure producer only in this fixture; report rendering never imports it.
  const { normalizeGoogleSearchRun } = await import('../../../packages/scan-engine/src/serpapi-normalizers');
  const { matchMerchantCandidate } = await import('../../../packages/scan-engine/src/entity-matcher');
  const entity = {
    businessName: 'Blue Bakery', aliases: [], domain: 'merchant.test',
    websiteUrl: 'https://merchant.test', placeId: null, gbpName: null,
    district: null, categories: [],
  };
  const fuzzyEntity = { ...entity, businessName: 'Happy Cafe' };
  const candidate = { title: 'Cafe Happy', link: 'https://other.test', snippet: '' };
  expect(matchMerchantCandidate(entity, candidate)).toMatchObject({ found: false, confidence: 'none' });
  expect(matchMerchantCandidate(fuzzyEntity, candidate)).toMatchObject({ found: true, confidence: 'low' });
  const normalize = (merchant: typeof entity) => normalizeGoogleSearchRun({
    entity: merchant,
    plan: {
      id: 'citation-masks-organic', query: 'best local business', query_type: 'discovery',
      engine: 'google', hl: 'en', gl: 'hk', location: null, ll: null, device: 'desktop',
    },
    requestedAt: '2026-09-08T00:00:00Z',
    data: {
      search_metadata: { status: 'Success' },
      organic_results: [{ ...candidate, position: 1 }],
      ai_overview: { answer: 'Local suggestions', references: [{ title: 'Official website', link: 'https://merchant.test' }] },
    },
  });
  const unmatched = normalize(entity);
  const fuzzy = normalize(fuzzyEntity);
  expect(unmatched.merchant_presence).toMatchObject({ found: true, confidence: 'high', organic_rank: null });
  // Citation bestMatch erases which organic candidate was fuzzy; competitors retain both.
  expect(JSON.parse(JSON.stringify(unmatched))).toEqual(JSON.parse(JSON.stringify(fuzzy)));
  for (const stored of [unmatched, fuzzy]) {
    expect(derive([stored]).groups[0]).toMatchObject({
      surface: 'organic', numerator: 0, denominator: 0,
      coverage: { excluded: { unknown: 1 } },
    });
  }
});
