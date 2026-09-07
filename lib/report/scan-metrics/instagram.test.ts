import { describe, expect, it } from 'vitest';

import { deriveInstagramSample } from './instagram';

it('does not turn historical zero into engagement', () => {
  const sample = deriveInstagramSample({
    posts: [
      { id: 'a', posted_at: '2026-09-01T00:00:00Z', like_count: 0, comment_count: 0 },
      { id: 'b', posted_at: '2026-09-02T00:00:00Z', like_count: 12 },
    ],
  });

  expect(sample?.distinctPosts).toBe(2);
  expect(sample?.datedPosts).toBe(2);
  expect(sample?.engagement).toBe('unavailable_historical_counts');
  expect(sample?.observations[0].ambiguousZero).toBe(true);
  expect(sample?.observations[1].comments).toBeNull();
});

describe('deriveInstagramSample', () => {
  it('distinguishes unavailable posts from a captured empty sample', () => {
    expect(deriveInstagramSample(undefined)).toBeNull();
    expect(deriveInstagramSample({})).toBeNull();
    expect(deriveInstagramSample({ posts: [] })).toEqual({
      distinctPosts: 0, datedPosts: 0, earliest: null, latest: null,
      engagement: 'unavailable_historical_counts',
      coverage: {
        inspected: 0, duplicates: 0,
        excluded: { unknown: 0, failed: 0, unsupported: 0, no_answer: 0, conflict: 0, unidentified: 0 },
        truncated: false, evidenceTruncated: false,
      },
      observations: [],
    });
  });

  it.each([
    ['string', '4'], ['NaN', Number.NaN], ['infinity', Number.POSITIVE_INFINITY],
    ['fraction', 1.5], ['negative', -1],
  ])('keeps an invalid %s count unknown', (_label, value) => {
    const sample = deriveInstagramSample({ posts: [{ id: 'post', like_count: value, comment_count: value }] });
    expect(sample?.observations[0]).toMatchObject({ likes: null, comments: null });
  });

  it('accepts strict ISO dates and rejects normalized impossible calendar days', () => {
    const sample = deriveInstagramSample({ posts: [
      { id: 'late', posted_at: '2026-09-02T23:30:00+08:00' },
      { id: 'early', posted_at: '2024-02-29T00:00:00Z' },
      { id: 'impossible', posted_at: '2026-02-30T00:00:00Z' },
      { id: 'loose', posted_at: 'September 1, 2026' },
    ] });
    expect(sample).toMatchObject({
      distinctPosts: 4, datedPosts: 2,
      earliest: '2024-02-29T00:00:00.000Z', latest: '2026-09-02T15:30:00.000Z',
    });
    expect(sample?.observations.map((row) => row.postedAt)).toEqual([
      '2026-09-02T15:30:00.000Z', '2024-02-29T00:00:00.000Z', null, null,
    ]);
  });

  it('deduplicates identities and nulls only fields that conflict', () => {
    const sample = deriveInstagramSample({ posts: [
      { id: 'same', posted_at: '2026-09-01T00:00:00Z', like_count: 4, comment_count: 2 },
      { id: 'same', posted_at: '2026-09-01T00:00:00Z', like_count: 4, comment_count: 2 },
      { id: 'same', posted_at: '2026-09-01T00:00:00Z', like_count: 5, comment_count: 2 },
    ] });
    expect(sample).toMatchObject({ distinctPosts: 1, datedPosts: 1, coverage: { inspected: 3, duplicates: 2 } });
    expect(sample?.coverage.excluded.conflict).toBe(1);
    expect(sample?.observations).toEqual([{
      identity: 'same', postedAt: '2026-09-01T00:00:00.000Z',
      likes: null, comments: 2, ambiguousZero: false,
    }]);
  });

  it('uses bounded IDs before safe canonical Instagram URLs', () => {
    const sample = deriveInstagramSample({ posts: [
      { id: ' stable-id ', permalink: 'https://www.instagram.com/p/ignored/' },
      { permalink: 'https://instagram.com/p/Ab_12-/?utm_source=test#fragment' },
      { permalink: 'https://user:password@instagram.com/reel/secret/' },
      { permalink: 'https://instagram.com/p/code/?access_token=secret' },
      { id: 'x'.repeat(301), caption: 'must not identify this' },
    ] });
    expect(sample?.distinctPosts).toBe(2);
    expect(sample?.coverage.excluded.unidentified).toBe(3);
    expect(sample?.observations.map((row) => row.identity)).toEqual([
      'stable-id', 'https://www.instagram.com/p/Ab_12-/', null, null, null,
    ]);
  });

  it('allows harmless key-containing query names but rejects credential names', () => {
    const sample = deriveInstagramSample({ posts: [
      { permalink: 'https://instagram.com/p/monkey/?monkey=banana' },
      { permalink: 'https://instagram.com/p/keyboard/?keyboard=mechanical' },
      { permalink: 'https://instagram.com/p/access/?access_token=secret' },
      { permalink: 'https://instagram.com/p/api/?apiKey=secret' },
      { permalink: 'https://instagram.com/p/password/?password=secret' },
    ] });

    expect(sample?.distinctPosts).toBe(2);
    expect(sample?.coverage.excluded.unidentified).toBe(3);
    expect(sample?.observations.map((row) => row.identity)).toEqual([
      'https://www.instagram.com/p/monkey/',
      'https://www.instagram.com/p/keyboard/',
      null,
      null,
      null,
    ]);
  });
  it('counts all seven valid stored posts and ignores the separate reels list', () => {
    const posts = Array.from({ length: 7 }, (_, index) => ({ id: `post-${index}` }));
    const sample = deriveInstagramSample({
      posts, reels: [{ id: 'reel-only', posted_at: '2026-09-08T00:00:00Z' }],
    });
    expect(sample?.distinctPosts).toBe(7);
    expect(sample?.coverage.inspected).toBe(7);
  });

  it('processes only the deterministic first 1000 records', () => {
    const posts = Array.from({ length: 1001 }, (_, index) => ({ id: `post-${index}` }));
    const sample = deriveInstagramSample({ posts });
    expect(sample?.distinctPosts).toBe(1000);
    expect(sample?.coverage).toMatchObject({ inspected: 1000, truncated: true });
    expect(sample?.observations).toHaveLength(50);
    expect(sample?.coverage.evidenceTruncated).toBe(true);
  });

  it('reports evidence truncation independently from input truncation', () => {
    const posts = Array.from({ length: 51 }, (_, index) => ({ id: `post-${index}` }));
    const sample = deriveInstagramSample({ posts });
    expect(sample?.distinctPosts).toBe(51);
    expect(sample?.coverage).toMatchObject({ inspected: 51, truncated: false, evidenceTruncated: true });
    expect(sample?.observations).toHaveLength(50);
  });
});
