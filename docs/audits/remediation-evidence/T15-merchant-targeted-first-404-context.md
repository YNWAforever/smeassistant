# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: merchant-loop.spec.ts >> hk: local fixture link redemption, exact draft approval/download, repeat usage and fresh edit
- Location: e2e\acceptance\merchant-loop.spec.ts:7:45

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.action-detail-page')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('.action-detail-page')

```

```yaml
- heading "404" [level=1]
- heading "This page could not be found." [level=2]
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1  | import { readFileSync } from "node:fs";
  2  | import { randomUUID } from "node:crypto";
  3  | import { test, expect, signIn } from "../../test/e2e/fixtures";
  4  | import { sql } from "../../test/e2e/environment";
  5  | import { seedMerchant } from "../../test/e2e/seed";
  6  | 
  7  | for (const market of ["hk", "tw"] as const) test(`${market}: local fixture link redemption, exact draft approval/download, repeat usage and fresh edit`, async ({ page, environment }) => {
  8  |   const merchant = await seedMerchant(environment, market);
  9  |   const link = await signIn(page, environment, merchant);
  10 |   expect(sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and accepted_at is not null;`)).toBe("1");
  11 |   sql(environment.db, `update actions set action_state='needs_input', required_inputs='["brand_voice","reviews_without_response","language"]'::jsonb, provided_inputs=provided_inputs-'brand_voice' where id='${merchant.actionId}';`);
  12 |   await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
> 13 |   await expect(page.locator(".action-detail-page")).toBeVisible();
     |                                                     ^ Error: expect(locator).toBeVisible() failed
  14 |   await expect(page.locator("#input-brand_voice")).toBeVisible();
  15 |   await page.locator("#input-brand_voice").fill("warm");
  16 |   const savedInputs = page.waitForResponse(response => response.url().endsWith(`/api/actions/${merchant.actionId}`) && response.request().method() === "PATCH");
  17 |   await page.getByRole("button", { name: "Save inputs and generate", exact: true }).click();
  18 |   expect((await savedInputs).status()).toBe(200);
  19 |   expect(sql(environment.db, `select provided_inputs->>'brand_voice' from actions where id='${merchant.actionId}';`)).toBe("warm");
  20 |   expect(sql(environment.db, `select count(*) from audit_events where entity_id='${merchant.actionId}' and event='action.updated';`)).toBe("1");
  21 |   await page.getByRole("tab", { name: "Version & audit history" }).click();
  22 |   await expect(page.locator(".version-list button")).toHaveCount(1, { timeout: 90000 });
  23 |   await page.getByRole("tab", { name: "Draft & approval" }).click();
  24 |   await page.locator("#draft-content").fill("Edited version two: fixture acceptance.");
  25 |   await page.getByRole("button", { name: /Save manual edits/ }).click();
  26 |   await page.getByRole("tab", { name: "Version & audit history" }).click();
  27 |   await expect(page.locator(".version-list button")).toHaveCount(2);
  28 |   await page.getByRole("tab", { name: "Draft & approval" }).click();
  29 |   await page.getByRole("button", { name: /^Approve Version 2$/ }).click();
  30 |   await page.getByRole("dialog").getByRole("button", { name: /Approve/ }).click();
  31 |   const downloadPromise = page.waitForEvent("download");
  32 |   await page.getByRole("button", { name: /Export approved version/ }).click();
  33 |   const download = await downloadPromise;
  34 |   expect(download.suggestedFilename()).toMatch(/-v2\.md$/);
  35 |   expect(readFileSync((await download.path())!, "utf8")).toContain("Edited version two: fixture acceptance.");
  36 |   const version = sql(environment.db, `select id from output_versions where action_id='${merchant.actionId}' and version_no=2 and approval_state='approved';`);
  37 |   expect(version).toMatch(/^[a-f0-9-]{36}$/);
  38 |   const key = randomUUID();
  39 |   const deliveries: string[] = [];
  40 |   for (let i = 0; i < 2; i++) {
  41 |     const response = await page.request.post(`/api/versions/${version}/export`, { data: { mode: "copy", idempotency_key: key } });
  42 |     expect(response.status()).toBe(200);
  43 |     const result = await response.json(); expect(result.counted).toBe(false); deliveries.push(result.deliveryId);
  44 |   }
  45 |   expect(deliveries[0]).toMatch(/^[a-f0-9-]{36}$/);
  46 |   expect(deliveries[1]).toBe(deliveries[0]);
  47 |   expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("1");
  48 |   expect(sql(environment.db, `select count(*) from deliveries where id='${deliveries[0]}' and version_id='${version}' and mode='copy';`)).toBe("1");
  49 |   const appliedIds: string[] = [];
  50 |   for (let i = 0; i < 2; i++) {
  51 |     const response = await page.request.post(`/api/actions/${merchant.actionId}/applied`, { data: { output_version_id: version, note: "Synthetic local application; no external publication" } });
  52 |     expect(response.status()).toBe(i === 0 ? 201 : 200);
  53 |     appliedIds.push((await response.json()).applicationId);
  54 |   }
  55 |   expect(appliedIds[0]).toMatch(/^[a-f0-9-]{36}$/);
  56 |   expect(appliedIds[1]).toBe(appliedIds[0]);
  57 |   expect(sql(environment.db, `select id from action_applications where action_id='${merchant.actionId}' and output_version_id='${version}' and retracted_at is null;`)).toBe(appliedIds[0]);
  58 |   expect(sql(environment.db, `select action_state from actions where id='${merchant.actionId}';`)).toBe("completed");
  59 |   expect(sql(environment.db, `select count(*) from action_applications where action_id='${merchant.actionId}' and output_version_id='${version}' and retracted_at is null;`)).toBe("1");
  60 |   expect(sql(environment.db, `select count(*) from audit_events where entity_id='${merchant.actionId}' and event='action.applied';`)).toBe("1");
  61 |   const edit = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: "Fresh edit requires approval", base_version_id: version } });
  62 |   expect(edit.status()).toBe(201);
  63 |   const v3 = await edit.json() as { versionId: string; versionNo: number };
  64 |   expect(v3.versionNo).toBe(3);
  65 |   expect((await page.request.post(`/api/versions/${v3.versionId}/export`, { data: { mode: "copy", idempotency_key: randomUUID() } })).status()).toBe(409);
  66 |   await page.goto(`/zh-HK/owner/${merchant.slug}/settings/billing`);
  67 |   expect(sql(environment.db, `select market from workspaces where id='${merchant.workspaceId}';`)).toBe(market);
  68 |   if (market === "tw") await expect(page.locator("body")).toContainText(/TWD|NT\$/);
  69 |   await page.goto(link);
  70 |   await expect(page).toHaveURL(/error=/);
  71 | });
  72 | 
  73 | for (const mode of ["missing", "invalid", "unavailable"] as const) test(`${mode} LLM output cannot create or approve a version or charge usage`, async ({ page, merchant, environment }) => {
  74 |   await signIn(page, environment, merchant);
  75 |   await fetch(`${environment.llm}/mode`, { method: "POST", body: mode });
  76 |   try {
  77 |     const response = await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } });
  78 |     expect(response.status()).toBe(200);
  79 |     const body = await response.json();
  80 |     expect(body.versionId).toBeUndefined();
  81 |     expect(sql(environment.db, `select count(*) from output_versions where action_id='${merchant.actionId}';`)).toBe("0");
  82 |     expect(sql(environment.db, `select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  83 |   } finally { await fetch(`${environment.llm}/mode`, { method: "POST", body: "success" }); }
  84 | });
  85 | 
```