import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { test, expect, signIn } from '../../test/e2e/fixtures';
import { sql } from '../../test/e2e/environment';
import { scanMetricsCopy } from '../../lib/copy';
import type { MerchantPerformanceEvidenceRun } from '../../packages/scoring/src/types';

const privatePattern = /PRIVATE_METRIC_QUERY|PRIVATE_METRIC_POST|PRIVATE_METRIC_SUMMARY/;
const longQuery = 'PRIVATE_METRIC_QUERY_' + 'ownedfixturelongquery'.repeat(18);
const quote = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'";
const observedAt = '2026-09-07T00:00:00.000Z';
// Stored producer fields, deliberately no synthetic eligibility flags.
const run = (id: string, engine: MerchantPerformanceEvidenceRun['engine'], presence: Partial<MerchantPerformanceEvidenceRun['merchant_presence']>, raw: MerchantPerformanceEvidenceRun['raw_refs'], failed = false): MerchantPerformanceEvidenceRun => ({
  id, query: id === 'organic-present' ? longQuery : `PRIVATE_METRIC_QUERY_${id}`,
  query_type: 'discovery', engine, requested_at: observedAt,
  settings: { gl: 'hk', hl: 'en', location: 'Hong Kong', ll: null, device: 'desktop' },
  serpapi: { search_id: null, total_time_taken: null, status: failed ? 'Error' : 'Success', error: failed ? 'Owned fixture failure' : null },
  merchant_presence: { found: false, confidence: 'none', confidence_reason: 'Owned illustrative fixture', matched_by: [], ai_mentioned: false, ai_cited: false, ai_citation_urls: [], organic_rank: null, local_pack_rank: null, maps_rank: null, ...presence },
  competitors: [], evidence_snippets: [], raw_refs: raw,
});

test('owned stored metrics stay private and render separate samples across locales and viewports', async ({ page, merchant, environment }) => {
  const diagnostics: string[] = [];
  page.on('pageerror', error => diagnostics.push('pageerror: ' + error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) diagnostics.push(message.type() + ': ' + message.text()); });
  mkdirSync('.superpowers/sdd/metrics/screenshots', { recursive: true });
  const id = randomUUID(), slug = `scan-metrics-${id}`;
  const raw = {
    ig: { profile: { username: 'owned_metrics_fixture', followers: 1000 }, posts: Array.from({ length: 8 }, (_, index) => ({
      id: `PRIVATE_METRIC_POST_${index}`, posted_at: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      like_count: index === 0 ? 0 : index + 10, comment_count: index + 1,
    })) },
    aeo: { merchant_performance: { generated_at: observedAt, runs: [
      run('organic-present', 'google', { organic_rank: 1, ai_mentioned: true, found: true, confidence: 'high' }, { organic_results: [{ title: 'Owned scan metrics fixture', link: 'https://example.test/owned', snippet: 'Owned illustrative fixture', position: 1 }], ai_overview_triggered: true, ai_overview_text: 'Owned fixture answer' }),
      run('organic-absent', 'google', { organic_rank: null, ai_mentioned: false, found: false, confidence: 'none' }, { organic_results: [{ title: 'Owned other fixture', link: 'https://example.test/other', snippet: 'Owned illustrative fixture', position: 1 }], ai_overview_triggered: false }),
      run('maps-absent-one', 'google_maps', { maps_rank: null, found: false, confidence: 'none' }, { maps_results: [{ title: 'Owned other fixture', position: 1 }] }),
      run('maps-absent-two', 'google_maps', { maps_rank: null, found: false, confidence: 'none' }, { maps_results: [{ title: 'Owned another fixture', position: 1 }] }),
      run('maps-failed', 'google_maps', { maps_rank: null, found: false, confidence: 'none' }, {}, true),
    ] } },
  };
  const modules = Object.fromEntries(['ig', 'aeo'].map(key => [key, { status: 'measured', score: 60, confidence: 'high', evidenceCollectedAt: observedAt, limitationCode: null }]));
  sql(environment.db, `insert into audit_jobs(id,share_slug,business_name,region,status,workspace_id,location_id,overall_score,score_coverage,module_results,completed_at,summary_en,summary_zh,summary_tw,raw_data) values ('${id}','${slug}','Owned scan metrics fixture - illustrative only','hk','done','${merchant.workspaceId}','${merchant.locationId}',60,0.5,${quote(modules)},'${observedAt}','PRIVATE_METRIC_SUMMARY','PRIVATE_METRIC_SUMMARY','PRIVATE_METRIC_SUMMARY',${quote(raw)});`);
  const panel = page.locator('section[aria-labelledby="scan-metrics-title"]');
  const assertPrivateResponse = async (locale: string) => {
    const response = await page.goto(`/${locale}/r/${slug}`);
    expect(response?.status()).toBe(200);
    expect(await response!.text()).not.toMatch(privatePattern);
    await expect(panel).toHaveCount(0);
    await expect(page.locator('[data-scan-metrics]')).toHaveCount(0);
    // An actual Next RSC request with the same cookies, not an HTML-only assertion.
    const rsc = await page.request.get(`/${locale}/r/${slug}?_rsc=${randomUUID()}`, { headers: { RSC: '1' } });
    expect(rsc.status()).toBe(200);
    expect(rsc.headers()['content-type']).toContain('text/x-component');
    const payload = await rsc.text();
    expect(payload).not.toMatch(privatePattern);
    expect(payload).not.toContain('scan-metrics-title');
  };
  for (const locale of ['en', 'zh-HK', 'zh-TW']) await assertPrivateResponse(locale);
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
    expect(await response!.text()).toContain('PRIVATE_METRIC_QUERY');
    await page.waitForLoadState('networkidle');
    const c = scanMetricsCopy[locale];
    await expect(panel).toBeVisible();
    const instagram = panel.locator('article').filter({ has: page.getByRole('heading', { name: c.instagram, exact: true }) });
    await expect(instagram).toContainText(c.posts.replace('{n}', '8'));
    await expect(instagram).toContainText(c.historical);
    await expect(instagram).not.toContainText('%');
    for (const [surface, numerator, denominator] of [['organic', 1, 2], ['maps', 0, 2], ['ai', 1, 1]] as const) {
      const article = panel.locator('article').filter({ has: page.getByRole('heading', { name: c[surface], exact: true }) });
      await expect(article.locator('meter')).toHaveAttribute('value', String(numerator));
      await expect(article.locator('meter')).toHaveAttribute('max', String(denominator));
      await expect(article).toContainText(c.appearances.replace('{x}', String(numerator)).replace('{n}', String(denominator)));
      if (surface === 'maps') await expect(article).toContainText(`${c.failed}: 1`);
      if (surface === 'ai') await expect(article).toContainText(`${c.no_answer}: 1`);
    }
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const details of await panel.locator('details').all()) {
        const summary = details.locator('summary');
        await expect(details).not.toHaveAttribute('open', '');
        await summary.focus(); await page.keyboard.press('Enter');
        await expect(details).toHaveAttribute('open', '');
        await page.keyboard.press('Space');
        await expect(details).not.toHaveAttribute('open', '');
        await page.keyboard.press('Enter');
      }
      await expect(instagram).toContainText(c.zero);
      const query = panel.getByText(longQuery, { exact: true }).first();
      await expect(query).toBeVisible();
      expect(await query.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (width === 375) expect(await query.evaluate(el => el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight) * 2)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const summary of await panel.locator('details summary').all()) { await summary.focus(); await page.keyboard.press('Space'); }
      await expect(panel.locator('details[open]')).toHaveCount(0);
      await page.screenshot({ path: `.superpowers/sdd/metrics/screenshots/owned-illustrative-metrics-${locale}-${width}.png`, fullPage: true });
    }
  }
  // Revoke only this owned grant; retained viewer cookies must not recover private data.
  expect(sql(environment.db, `update report_access_grants set revoked_at=now() where job_id='${id}' and revoked_at is null returning id;`)).not.toBe('');
  for (const locale of ['en', 'zh-HK', 'zh-TW']) await assertPrivateResponse(locale);
  await page.waitForLoadState('networkidle');
  writeFileSync('.superpowers/sdd/metrics/task-5-owned-browser-diagnostics.log', diagnostics.join('\n'));
  await expect(page.getByRole('button', { name: /issue/i })).toHaveCount(0);
  expect(diagnostics).toEqual([]);
});
