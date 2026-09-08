import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { test, expect, signIn } from '../../test/e2e/fixtures';
import { sql } from '../../test/e2e/environment';
import { comparisonCopy } from '../../lib/report/comparison/copy';
import type { MerchantPerformanceEvidenceRun } from '../../packages/scoring/src/types';

const previousDate = '2026-08-01T00:00:00.000Z';
const currentDate = '2026-09-01T00:00:00.000Z';
const privatePattern = /PRIVATE_COMPARISON_(?:CURRENT|EARLIER|OTHER_LOCATION)|scan-comparison-title/;
const quote = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'";
const run = (id: string, observedAt: string): MerchantPerformanceEvidenceRun => ({
  id, query: `PRIVATE_COMPARISON_${id}`, query_type: 'discovery', engine: 'google', requested_at: observedAt,
  settings: { gl: 'hk', hl: 'en', location: 'Hong Kong', ll: null, device: 'desktop' },
  serpapi: { search_id: null, total_time_taken: null, status: 'Success', error: null },
  merchant_presence: { found: true, confidence: 'high', confidence_reason: 'Owned fixture', matched_by: [], ai_mentioned: false, ai_cited: false, ai_citation_urls: [], organic_rank: 1, local_pack_rank: null, maps_rank: null },
  competitors: [], evidence_snippets: [], raw_refs: { organic_results: [{ title: 'Owned fixture', link: 'https://example.test/owned', snippet: 'Owned fixture', position: 1 }] },
});
const raw = (id: string, observedAt: string) => ({ aeo: { merchant_performance: { generated_at: observedAt, runs: [run(id, observedAt)] } } });

test('actual share route keeps earlier comparison evidence private and shows unavailable after current-only unlock', async ({ page, merchant, environment }) => {
  const diagnostics: string[] = [];
  page.on('pageerror', error => diagnostics.push('pageerror: ' + error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) diagnostics.push(message.type() + ': ' + message.text()); });
  mkdirSync('.superpowers/sdd/comparison/screenshots', { recursive: true });
  const currentId = randomUUID(), earlierId = randomUUID(), otherLocationId = randomUUID();
  const slug = `scan-comparison-${currentId}`;
  const modules = { aeo: { status: 'measured', score: 60, confidence: 'high', evidenceCollectedAt: currentDate, limitationCode: null } };
  const insert = (id: string, shareSlug: string, locationId: string, completedAt: string, sentinel: string) => sql(environment.db,
    `insert into audit_jobs(id,share_slug,business_name,region,status,workspace_id,location_id,overall_score,score_coverage,module_results,completed_at,summary_en,summary_zh,summary_tw,raw_data) values ('${id}','${shareSlug}','Owned comparison fixture','hk','done','${merchant.workspaceId}','${locationId}',60,1,${quote(modules)},'${completedAt}','${sentinel}_SUMMARY','${sentinel}_SUMMARY','${sentinel}_SUMMARY',${quote(raw(sentinel, completedAt))});`);
  insert(earlierId, `earlier-${earlierId}`, merchant.locationId, previousDate, 'PRIVATE_COMPARISON_EARLIER');
  insert(otherLocationId, `other-${otherLocationId}`, merchant.otherLocationId, '2026-08-15T00:00:00.000Z', 'PRIVATE_COMPARISON_OTHER_LOCATION');
  insert(currentId, slug, merchant.locationId, currentDate, 'PRIVATE_COMPARISON_CURRENT');

  const assertRscPrivate = async (locale: string, unlocked: boolean) => {
    const rsc = await page.request.get(`/${locale}/r/${slug}?_rsc=${randomUUID()}`, { headers: { RSC: '1' } });
    expect(rsc.status()).toBe(200);
    expect(rsc.headers()['content-type']).toContain('text/x-component');
    const payload = await rsc.text();
    expect(payload).not.toContain(earlierId);
    expect(payload).not.toContain(otherLocationId);
    expect(payload).not.toContain('PRIVATE_COMPARISON_EARLIER');
    expect(payload).not.toContain('PRIVATE_COMPARISON_OTHER_LOCATION');
    expect(payload).not.toContain(previousDate);
    if (!unlocked) expect(payload).not.toMatch(privatePattern);
  };

  for (const locale of ['en', 'zh-HK', 'zh-TW']) {
    const response = await page.goto(`/${locale}/r/${slug}`);
    expect(response?.status()).toBe(200);
    expect(await response!.text()).not.toMatch(privatePattern);
    await expect(page.locator('section[aria-labelledby="scan-comparison-title"]')).toHaveCount(0);
    await assertRscPrivate(locale, false);
  }

  await signIn(page, environment, merchant, 'viewer');
  const unlocked = await page.request.post('/api/report-access/unlock', { data: {
    slug, market: 'hk', locale: 'en', objective: 'understand_performance', preferred_contact_channel: 'whatsapp',
    contact_identifier: '+85255555555', recovery_email: merchant.emails.viewer, report_delivery: true,
    scan_discussion: false, marketing: false, idempotency_key: randomBytes(32).toString('base64url'),
  } });
  expect(unlocked.status()).toBe(200);

  for (const locale of ['en', 'zh-HK', 'zh-TW'] as const) {
    const response = await page.goto(`/${locale}/r/${slug}`);
    expect(response?.status()).toBe(200);
    const html = await response!.text();
    expect(html).toContain('PRIVATE_COMPARISON_CURRENT');
    expect(html).not.toContain(earlierId);
    expect(html).not.toContain(otherLocationId);
    expect(html).not.toContain('PRIVATE_COMPARISON_EARLIER');
    expect(html).not.toContain('PRIVATE_COMPARISON_OTHER_LOCATION');
    expect(html).not.toContain(previousDate);
    await assertRscPrivate(locale, true);
    const panel = page.locator('section[aria-labelledby="scan-comparison-title"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(comparisonCopy[locale].unavailable.no_accessible_pair);
    await expect(page.getByText('PRIVATE_COMPARISON_CURRENT', { exact: false }).first()).toBeVisible();
    await expect(panel.locator('details')).toHaveCount(0);
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `.superpowers/sdd/comparison/screenshots/actual-route-unavailable-${locale}-${width}.png`, fullPage: true });
    }
  }
  writeFileSync('.superpowers/sdd/comparison/task-5-owned-browser-diagnostics.log', diagnostics.join('\n'));
  expect(diagnostics).toEqual([]);
});