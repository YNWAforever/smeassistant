import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";
import { seedMerchant } from "../../test/e2e/seed";

for (const market of ["hk", "tw"] as const) test(`${market}: real magic link, exact draft approval/download, repeat usage and fresh edit`, async ({ page, environment }) => {
  const merchant = await seedMerchant(environment, market);
  const link = await signIn(page, environment, merchant);
  expect(sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and accepted_at is not null;`)).toBe("1");
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await expect(page.locator(".action-detail-page")).toBeVisible();
  await page.getByRole("button", { name: /Generate a draft|Regenerate/ }).click();
  await page.getByRole("tab", { name: "Version & audit history" }).click();
  await expect(page.locator(".version-list button")).toHaveCount(1, { timeout: 90000 });
  await page.getByRole("tab", { name: "Draft & approval" }).click();
  await page.locator("#draft-content").fill("Edited version two: fixture acceptance.");
  await page.getByRole("button", { name: /Save manual edits/ }).click();
  await page.getByRole("tab", { name: "Version & audit history" }).click();
  await expect(page.locator(".version-list button")).toHaveCount(2);
  await page.getByRole("tab", { name: "Draft & approval" }).click();
  await page.getByRole("button", { name: /^Approve Version 2$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Approve/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export approved version/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-v2\.md$/);
  expect(readFileSync((await download.path())!, "utf8")).toContain("Edited version two: fixture acceptance.");
  const version = sql(environment.db, `select id from output_versions where action_id='${merchant.actionId}' and version_no=2 and approval_state='approved';`);
  expect(version).toMatch(/^[a-f0-9-]{36}$/);
  const key = randomUUID();
  for (let i = 0; i < 2; i++) expect((await page.request.post(`/api/versions/${version}/export`, { data: { mode: "copy", idempotency_key: key } })).status()).toBe(200);
  expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("1");
  expect(sql(environment.db, `select count(*) from deliveries where idempotency_key='${key}';`)).toBe("1");
  const edit = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: "Fresh edit requires approval", base_version_id: version } });
  expect(edit.status()).toBe(201);
  const v3 = await edit.json() as { versionId: string; versionNo: number };
  expect(v3.versionNo).toBe(3);
  expect((await page.request.post(`/api/versions/${v3.versionId}/export`, { data: { mode: "copy", idempotency_key: randomUUID() } })).status()).toBe(409);
  await page.goto(`/zh-HK/owner/${merchant.slug}/settings/billing`);
  expect(sql(environment.db, `select market from workspaces where id='${merchant.workspaceId}';`)).toBe(market);
  if (market === "tw") await expect(page.locator("body")).toContainText(/TWD|NT\$/);
  await page.goto(link);
  await expect(page).toHaveURL(/error=/);
});

for (const mode of ["missing", "invalid", "unavailable"] as const) test(`${mode} LLM output cannot create or approve a version or charge usage`, async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  await fetch(`${environment.llm}/mode`, { method: "POST", body: mode });
  try {
    const response = await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.versionId).toBeUndefined();
    expect(sql(environment.db, `select count(*) from output_versions where action_id='${merchant.actionId}';`)).toBe("0");
    expect(sql(environment.db, `select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  } finally { await fetch(`${environment.llm}/mode`, { method: "POST", body: "success" }); }
});
