import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, requestSignInLink, waitForHydration } from "../../test/e2e/fixtures";
import { sql, type AcceptanceEnvironment } from "../../test/e2e/environment";
import type { MerchantSeed } from "../../test/e2e/seed";

const evidence = ".superpowers/sdd/review-usage-reliability-20261017/browser";
mkdirSync(evidence, { recursive: true });

async function signIn(page: Parameters<typeof requestSignInLink>[0], environment: AcceptanceEnvironment, merchant: MerchantSeed) {
  const link = await requestSignInLink(page, environment, merchant);
  await page.goto(link);
  await expect(page).toHaveURL(new RegExp(`/en/owner/${merchant.slug}`), { timeout: 60_000 });
}

test("shows every version, approval, and repeated delivery audit without double-counting usage", async ({
  page,
  environment,
  merchant,
}) => {
  await signIn(page, environment, merchant);

  const first = await page.request.post(`/api/actions/${merchant.actionId}/versions`, {
    data: { body: "Original acceptance draft.", base_version_id: null },
  });
  expect(first.status()).toBe(201);
  const version1 = await first.json() as { versionId: string };

  const second = await page.request.post(`/api/actions/${merchant.actionId}/versions`, {
    data: { body: "Accepted review reply. Please leave another comment if we can help.", base_version_id: version1.versionId },
  });
  expect(second.status()).toBe(201);
  const version2 = await second.json() as { versionId: string; versionNo: number };

  const approved = await page.request.post(`/api/versions/${version2.versionId}/approve`, {
    data: { comment: "Approved after reviewing the exact saved version." },
  });
  expect(approved.status()).toBe(200);

  const firstKey = "audit-browser-first-export-20261017";
  const secondKey = "audit-browser-second-export-20261017";
  const firstExport = await page.request.post(`/api/versions/${version2.versionId}/export`, {
    data: { mode: "export", idempotency_key: firstKey },
  });
  expect(firstExport.status()).toBe(200);
  const delivery = await firstExport.json() as { deliveryId: string; counted: boolean; usage: { approved_deliveries: number } };
  expect(delivery).toMatchObject({ counted: true, usage: { approved_deliveries: 1 } });

  const replay = await page.request.post(`/api/versions/${version2.versionId}/export`, {
    data: { mode: "export", idempotency_key: firstKey },
  });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({
    deliveryId: delivery.deliveryId,
    counted: false,
    usage: { approved_deliveries: 1 },
  });

  const repeat = await page.request.post(`/api/versions/${version2.versionId}/export`, {
    data: { mode: "export", idempotency_key: secondKey },
  });
  expect(repeat.status()).toBe(200);
  const freshDelivery = await repeat.json() as { deliveryId: string; counted: boolean; usage: { approved_deliveries: number } };
  expect(freshDelivery.deliveryId).not.toBe(delivery.deliveryId);
  expect(freshDelivery).toMatchObject({ counted: false, usage: { approved_deliveries: 1 } });

  const auditCounts = JSON.parse(sql(environment.db, `select json_build_object(
    'saved', count(*) filter (where event='version.created'),
    'approved', count(*) filter (where event='version.approved'),
    'exported', count(*) filter (where event='delivery.exported'),
    'published', count(*) filter (where event in ('delivery.published','content.published','version.published'))
  ) from audit_events where workspace_id='${merchant.workspaceId}';`));
  expect(auditCounts).toEqual({ saved: 2, approved: 1, exported: 2, published: 0 });

  const deliveryUsage = JSON.parse(sql(environment.db, `select json_build_object(
    'deliveries', (select count(*) from deliveries where workspace_id='${merchant.workspaceId}'),
    'counted', (select count(*) from deliveries where workspace_id='${merchant.workspaceId}' and counted),
    'usage', (select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}')
  );`));
  expect(deliveryUsage).toEqual({ deliveries: 2, counted: 1, usage: 1 });

  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await waitForHydration(page);
  await expect(page.locator("#draft-content")).toHaveValue(
    "Accepted review reply. Please leave another comment if we can help.",
  );
  await page.getByRole("tab", { name: "Version & audit history", exact: true }).click();
  const auditList = page.locator(".audit-mini");
  await expect(auditList.getByText("Version saved", { exact: true })).toHaveCount(2);
  await expect(auditList.getByText("Version approved", { exact: true })).toHaveCount(1);
  await expect(auditList.getByText("Export recorded", { exact: true })).toHaveCount(2);
  const usage = page.locator(".usage-mini");
  await expect(usage.getByText("Approved deliveries", { exact: true })).toBeVisible();
  await expect(usage.getByText("1 / 3", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidence}/audit-delivery-history.png`, fullPage: true });

  writeFileSync(`${evidence}/audit-delivery-history.json`, JSON.stringify({
    environment: "owned local DB/Auth/model fixtures; no model request",
    result: "PASS",
    version1Id: version1.versionId,
    version2,
    firstDelivery: delivery,
    repeatedDelivery: freshDelivery,
    auditCounts,
    deliveryUsage,
  }, null, 2));
});
