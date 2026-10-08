import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";
import { seedMerchant } from "../../test/e2e/seed";

for (const market of ["hk", "tw"] as const) test(`${market}: local fixture link redemption, exact draft approval/download, repeat usage and fresh edit`, async ({ page, environment }) => {
  const merchant = await seedMerchant(environment, market);
  const link = await signIn(page, environment, merchant);
  expect(sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and accepted_at is not null;`)).toBe("1");
  sql(environment.db, `update actions set action_state='needs_input', required_inputs='["brand_voice","reviews_without_response","language"]'::jsonb, provided_inputs=provided_inputs-'brand_voice' where id='${merchant.actionId}';`);
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await expect(page.locator(".action-detail-page")).toBeVisible();
  await expect(page.locator("#input-brand_voice")).toBeVisible();
  await page.locator("#input-brand_voice").fill("warm");
  const savedInputs = page.waitForResponse(response => response.url().endsWith(`/api/actions/${merchant.actionId}`) && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "Save inputs and generate", exact: true }).click();
  expect((await savedInputs).status()).toBe(200);
  expect(sql(environment.db, `select provided_inputs->>'brand_voice' from actions where id='${merchant.actionId}';`)).toBe("warm");
  expect(sql(environment.db, `select count(*) from audit_events where entity_id='${merchant.actionId}' and event='action.updated';`)).toBe("1");
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
  const deliveries: string[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await page.request.post(`/api/versions/${version}/export`, { data: { mode: "copy", idempotency_key: key } });
    expect(response.status()).toBe(200);
    const result = await response.json(); expect(result.counted).toBe(false); deliveries.push(result.deliveryId);
  }
  expect(deliveries[0]).toMatch(/^[a-f0-9-]{36}$/);
  expect(deliveries[1]).toBe(deliveries[0]);
  expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("1");
  expect(sql(environment.db, `select count(*) from deliveries where id='${deliveries[0]}' and version_id='${version}' and mode='copy';`)).toBe("1");
  const appliedIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await page.request.post(`/api/actions/${merchant.actionId}/applied`, { data: { output_version_id: version, note: "Synthetic local application; no external publication" } });
    expect(response.status()).toBe(i === 0 ? 201 : 200);
    appliedIds.push((await response.json()).applicationId);
  }
  expect(appliedIds[0]).toMatch(/^[a-f0-9-]{36}$/);
  expect(appliedIds[1]).toBe(appliedIds[0]);
  expect(sql(environment.db, `select id from action_applications where action_id='${merchant.actionId}' and output_version_id='${version}' and retracted_at is null;`)).toBe(appliedIds[0]);
  expect(sql(environment.db, `select action_state from actions where id='${merchant.actionId}';`)).toBe("completed");
  expect(sql(environment.db, `select count(*) from action_applications where action_id='${merchant.actionId}' and output_version_id='${version}' and retracted_at is null;`)).toBe("1");
  expect(sql(environment.db, `select count(*) from audit_events where entity_id='${merchant.actionId}' and event='action.applied';`)).toBe("1");
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
