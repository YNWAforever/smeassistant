import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, requestSignInLink, waitForHydration } from "../../test/e2e/fixtures";
import { sql, type AcceptanceEnvironment } from "../../test/e2e/environment";
import type { MerchantSeed } from "../../test/e2e/seed";

const evidence = ".superpowers/sdd/review-usage-reliability-20261017/browser";
mkdirSync(evidence, { recursive: true });
const record = (name: string, value: unknown) => writeFileSync(`${evidence}/${name}.json`, JSON.stringify(value, null, 2));
async function signIn(page: Parameters<typeof requestSignInLink>[0], environment: AcceptanceEnvironment, merchant: MerchantSeed) {
  const link = await requestSignInLink(page, environment, merchant);
  await page.goto(link);
  // The next app route compiles on a cold fixture worker. Keep the exact
  // redirect assertion while allowing the existing dev server to finish.
  await expect(page).toHaveURL(new RegExp(`/en/owner/${merchant.slug}`), { timeout: 60_000 });
}

test.beforeEach(async ({ environment }) => {
  await fetch(`${environment.llm}/release`, { method: "POST" });
  await fetch(`${environment.llm}/mode`, { method: "POST", body: "success" });
  await fetch(`${environment.llm}/output`, { method: "POST", body: "null" });
});

for (const locale of ["en", "zh-HK"] as const) {
  test(`available owner review is not requested again (${locale})`, async ({ page, environment, merchant }) => {
    if (locale === "zh-HK") await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, environment, merchant);
    const body = locale === "en" ? "Thank you for your feedback. Please leave any further comments here."
      : "多謝你嘅意見，歡迎喺呢度留言補充。";
    await fetch(`${environment.llm}/output`, { method: "POST", body: JSON.stringify({
      title: "Review reply", body, facts_needed: ["reviews_without_response"],
      facts_used: [], acceptance_criteria: [], warnings: [],
    }) });
    await page.goto(`/${locale}/owner/${merchant.slug}/actions/${merchant.actionId}`);
    const generated = page.waitForResponse(response => response.url().endsWith(`/api/actions/${merchant.actionId}/run`));
    await page.getByRole("button", { name: locale === "en" ? "Generate a draft" : "生成草稿", exact: true }).click();
    const response = await generated;
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.versionId).toBeTruthy();
    expect(result.factsNeeded).toBeUndefined();
    await expect(page.locator("#draft-content")).toHaveValue(body);
    await expect(page.locator("#input-reviews_without_response")).toHaveCount(0);
    const row = JSON.parse(sql(environment.db, `select row_to_json(r) from (
      select state,input_tokens,output_tokens,input->'provider_usage' as provider_usage from action_runs where id='${result.runId}') r;`));
    expect(row).toMatchObject({ state: "succeeded", input_tokens: 10, output_tokens: 10, provider_usage: { status: "complete" } });
    expect(Object.keys(row.provider_usage.attempts)).toHaveLength(1);
    await page.reload(); await waitForHydration(page);
    await expect(page.locator("#draft-content")).toHaveValue(body);
    await page.screenshot({ path: `${evidence}/available-${locale}.png`, fullPage: true });
    record(`available-${locale}`, { environment: "owned local DB/Auth/model fixtures; not real AI", result: "PASS", runId: result.runId, versionId: result.versionId, observation: row });
  });
}

test("missing review still asks before any provider request", async ({ page, environment, merchant }) => {
  await signIn(page, environment, merchant);
  sql(environment.db, `update actions set provided_inputs='{"language":"en"}' where id='${merchant.actionId}';`);
  const before = (await (await fetch(`${environment.llm}/requests`)).json()).length;
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await page.getByRole("button", { name: "Generate a draft", exact: true }).click();
  await expect(page.locator("#input-reviews_without_response")).toBeVisible();
  expect((await (await fetch(`${environment.llm}/requests`)).json()).length).toBe(before);
  expect(sql(environment.db, `select count(*) from output_versions where action_id='${merchant.actionId}';`)).toBe("0");
});

test("late measured usage settles after timeout without another inference or a late version", async ({ page, environment, merchant }) => {
  await signIn(page, environment, merchant);
  const original = "Existing owner draft. Thank you for your review.";
  const saved = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: original, base_version_id: null } });
  expect(saved.status()).toBe(201);
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await expect(page.locator("#draft-content")).toHaveValue(original);
  const before = (await (await fetch(`${environment.llm}/requests`)).json()).length;
  await fetch(`${environment.llm}/hold`, { method: "POST" });
  try {
    const response = page.waitForResponse(result => result.url().endsWith(`/api/actions/${merchant.actionId}/run`), { timeout: 65_000 });
    const started = Date.now();
    await page.getByRole("button", { name: "Regenerate with the agent as a new version", exact: true }).click();
    const result = await (await response).json();
    const elapsedMs = Date.now() - started;
    expect(result).toMatchObject({ state: "failed", usagePending: true });
    expect(elapsedMs).toBeGreaterThanOrEqual(45_000);
    expect(elapsedMs).toBeLessThan(55_000);
    const denied = await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } });
    expect(denied.status()).toBe(409);
    expect((await denied.json()).error).toBe("provider_usage_pending");
    expect((await (await fetch(`${environment.llm}/requests`)).json()).length).toBe(before + 1);
    // Release immediately: the usage-only window has not changed the 45s
    // output deadline and remains within the existing 60s route lifetime.
    await fetch(`${environment.llm}/release`, { method: "POST" });
    await expect.poll(() => sql(environment.db, `select input #>> '{provider_usage,status}' from action_runs where id='${result.runId}';`),
      { timeout: 8000 }).toBe("complete");
    const observed = JSON.parse(sql(environment.db, `select row_to_json(r) from (
      select state,output,input_tokens,output_tokens,input->'provider_usage' as provider_usage from action_runs where id='${result.runId}') r;`));
    expect(observed).toMatchObject({ state: "failed", output: null, input_tokens: 10, output_tokens: 10 });
    expect(Object.values(observed.provider_usage.attempts)).toEqual([expect.objectContaining({ state: "reported", late: true })]);
    expect(sql(environment.db, `select count(*) from output_versions where action_id='${merchant.actionId}';`)).toBe("1");
    await expect(page.getByRole("button", { name: "Reload draft and run status" })).toBeVisible();
    await page.reload(); await waitForHydration(page);
    await expect(page.locator("#draft-content")).toHaveValue(original);
    await expect(page.getByRole("button", { name: "Regenerate with the agent as a new version", exact: true })).toBeEnabled();
    expect(sql(environment.db, `select count(*) from deliveries where workspace_id='${merchant.workspaceId}';`)).toBe("0");
    await page.screenshot({ path: `${evidence}/late-usage-settled.png`, fullPage: true });
    record("late-usage", { environment: "owned local DB/Auth/model fixtures; not real AI", result: "PASS", elapsedMs, providerCalls: 1, retainedVersions: 1, observation: observed });
  } finally { await fetch(`${environment.llm}/release`, { method: "POST" }); }
});
