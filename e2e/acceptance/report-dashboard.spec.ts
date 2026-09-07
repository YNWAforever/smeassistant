import { writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { test, expect, signIn } from '../../test/e2e/fixtures';
import { sql } from '../../test/e2e/environment';

test('real report excludes private serialized data publicly and grants unlocked viewer full read access', async ({ page, merchant, environment }) => {
  const diagnostics: string[] = [];
  page.on('pageerror', error => diagnostics.push('pageerror: ' + error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) diagnostics.push(message.type() + ': ' + message.text()); });
  const id = randomUUID(), slug = `dashboard-${id}`;
  sql(environment.db, `insert into audit_jobs(id,share_slug,business_name,region,status,workspace_id,location_id,overall_score,score_coverage,module_results,completed_at,summary_en,raw_data) values ('${id}','${slug}','Owned dashboard fixture','hk','done','${merchant.workspaceId}','${merchant.locationId}',62,0.75,'{"ig":{"status":"measured","score":60,"confidence":"high"},"gbp":{"status":"measured","score":64,"confidence":"high"},"aeo":{"status":"measured","score":62,"confidence":"high"}}',now(),'PRIVATE_DASHBOARD_SUMMARY','{"ig":{"profile":{"followers":321987,"username":"PRIVATE_PROFILE_SENTINEL"}},"gbp":{"rating":4.2,"reviews_count":87},"aeo":{"merchant_performance":{"generated_at":"2026-09-07T00:00:00Z","runs":[{"query":"Illustrative fixture cafes","engine":"google_maps","merchant_presence":{"found":true,"confidence":"high","maps_rank":2,"maps_rating":4.2,"maps_reviews":87},"competitors":[{"name":"Illustrative fixture neighbour","source":"maps","rank":1,"rating":4.6,"reviews":120}]}]}}}'); insert into audit_findings(job_id,finding_key,module,severity,score_impact,owner_message_en,owner_action_en,evidence) values ('${id}','ig.profile_clarity','ig','warning',-10,'PRIVATE_DASHBOARD_FINDING','PRIVATE_DASHBOARD_ACTION','{"source":"https://example.test/PRIVATE_SOURCE_SENTINEL"}');`);
  const response = await page.goto(`/en/r/${slug}`);
  expect(response?.status()).toBe(200);
  expect(await response!.text()).not.toMatch(/PRIVATE_DASHBOARD|PRIVATE_PROFILE|PRIVATE_SOURCE|321987/);
  await expect(page.locator('[data-metric]')).toHaveCount(0);
  await expect(page.locator('a[href*="/unlock/"]').first()).toBeVisible();
  await signIn(page, environment, merchant, 'viewer');
  const unlocked = await page.request.post('/api/report-access/unlock', { data: {
    slug, market: 'hk', locale: 'en', objective: 'understand_performance', preferred_contact_channel: 'whatsapp',
    contact_identifier: '+85255555555', recovery_email: merchant.emails.viewer, report_delivery: true,
    scan_discussion: false, marketing: false, idempotency_key: randomBytes(32).toString('base64url'),
  } });
  expect(unlocked.status()).toBe(200);
  const authorized = await page.goto(`/en/r/${slug}`);
  expect(authorized?.status()).toBe(200);
  await page.waitForLoadState('networkidle');
  expect(await authorized!.text()).toContain('PRIVATE_DASHBOARD_FINDING');
  await expect(page.locator('[data-metric="instagram-followers"] strong')).toHaveText('321,987');
  await expect(page.locator('body')).toContainText('PRIVATE_DASHBOARD_SUMMARY');
  const details = page.locator('#report-detail-ig + details');
  await details.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details).toContainText('PRIVATE_DASHBOARD_FINDING');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await expect(page.locator('meter[max="120"]').first()).toBeVisible();
  const metric = page.locator('[data-metric="instagram-followers"]');
  expect(await metric.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('#report-detail-ig')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `.superpowers/sdd/dashboard/screenshots/owned-authorized-fixture-report-en-${width}.png`, fullPage: true });
  }
  writeFileSync('.superpowers/sdd/dashboard/task-5-owned-browser-diagnostics.log', diagnostics.join('\n'));
  const issues = page.getByRole('button', { name: /issue/i }).first();
  await expect(issues).toHaveCount(0);
  expect(diagnostics).toEqual([]);
  writeFileSync('.superpowers/sdd/dashboard/task-5-owned-next-issues.log', await page.locator('nextjs-portal').evaluateAll(elements => elements.map(el => Array.from(el.shadowRoot?.children ?? []).filter(child => child.tagName !== 'STYLE').map(child => (child as HTMLElement).innerText).join('\n')).join('\n')));
});