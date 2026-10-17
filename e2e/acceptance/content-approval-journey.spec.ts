import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, signIn, waitForHydration } from "../../test/e2e/fixtures";
import { sql, type AcceptanceEnvironment } from "../../test/e2e/environment";
import { seedMerchant, type MerchantSeed } from "../../test/e2e/seed";

const evidenceDir = ".superpowers/sdd/content-approval-journey-20261017";
const deliveriesByTest = new WeakMap<Page, string[]>();
const actionPath = (merchant: MerchantSeed, locale = "en") => `/${locale}/owner/${merchant.slug}/actions/${merchant.actionId}`;
const versionCount = (env: AcceptanceEnvironment, merchant: MerchantSeed) =>
  sql(env.db, `select count(*) from output_versions where action_id='${merchant.actionId}';`);
const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
const output = (body: string) => ({
  title: "Synthetic review reply", body, acceptance_criteria: [], warnings: [], facts_used: [], facts_needed: [],
});
async function modelOutput(env: AcceptanceEnvironment, body: string | null) {
  expect((await fetch(`${env.llm}/output`, { method: "POST", body: JSON.stringify(body === null ? null : output(body)) })).status).toBe(200);
}
async function prompts(env: AcceptanceEnvironment): Promise<string[]> {
  const requests = await (await fetch(`${env.llm}/requests`)).json() as unknown[];
  return requests.map(request => JSON.stringify(request));
}
async function saveBrand(page: Page, merchant: MerchantSeed, facts: Record<string, string> = {}, voice = "professional", language = "en") {
  const current = await (await page.request.get(`/api/workspaces/${merchant.workspaceId}/brand`)).json();
  const saved = await page.request.put(`/api/workspaces/${merchant.workspaceId}/brand`, {
    data: { voice, approved_claims: [], prohibited_terms: ["Guaranteed"], languages: [language], facts, expectedRevisionId: current.brand.revisionId ?? null },
  });
  expect(saved.status()).toBe(200);
  return (await saved.json()).brand as { revisionId: string };
}
async function generate(page: Page, merchant: MerchantSeed, body: string, env: AcceptanceEnvironment, chinese = false) {
  await modelOutput(env, body);
  const response = page.waitForResponse(r => r.url().endsWith(`/api/actions/${merchant.actionId}/run`) && r.request().method() === "POST");
  await page.getByRole("button", { name: chinese ? /^(生成草稿|以 Agent 重新生成為新版本)$/ : /^(Generate a draft|Regenerate with the agent as a new version)$/ }).click();
  const saved = await response;
  expect(saved.status()).toBe(200);
  const result = await saved.json() as { versionId: string; versionNo: number };
  expect(result.versionId).toMatch(/^[a-f0-9-]{36}$/);
  await expect(page.locator("#draft-content")).toHaveValue(body);
  return result;
}
async function approve(page: Page, merchant: MerchantSeed, env: AcceptanceEnvironment, versionNo: number, chinese = false) {
  const name = chinese ? `核准第 ${versionNo} 版` : `Approve Version ${versionNo}`;
  await page.getByRole("button", { name, exact: true }).click();
  const response = page.waitForResponse(r => /\/api\/versions\/[^/]+\/approve$/.test(new URL(r.url()).pathname));
  await page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
  expect((await response).status()).toBe(200);
  expect(sql(env.db, `select approval_state from output_versions where action_id='${merchant.actionId}' and version_no=${versionNo};`)).toBe("approved");
  expect(sql(env.db, `select count(*) from deliveries where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  expect(sql(env.db, `select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("0");
}
function record(name: string, data: Record<string, unknown>) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(`${evidenceDir}/${name}.json`, JSON.stringify({ environment: "owned local DB/Auth/model fixtures; no real provider", observedAt: new Date().toISOString(), ...data }, null, 2));
}

test.beforeEach(async ({ environment, merchant, page }) => {
  const forbidden: string[] = [];
  deliveriesByTest.set(page, forbidden);
  page.context().on("request", request => {
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET" && /\/(?:export|publish|schedule|applied)(?:\/|$)/.test(path)) forbidden.push(path);
  });
  record("fixture-identity", {
    container: environment.db,
    database: sql(environment.db, "select current_database();"),
    roleUsedByFixtureControl: sql(environment.db, "select current_user;"),
    boundary: "owned Docker labels and exact container ID checked by startNeonDatabaseFixture; network none; no published ports; loopback Docker-exec relay",
    cleanup: "finally env.stop verifies and removes only this exact owned container",
  });
  await fetch(`${environment.llm}/release`, { method: "POST" });
  await fetch(`${environment.llm}/mode`, { method: "POST", body: "success" });
  await modelOutput(environment, null);
  const evidence = JSON.stringify({
    factType: "Observed", source: "Google Business Profile", value: "1",
    detail: { en: "One synthetic review is waiting for a reply.", "zh-HK": "一則合成評論等候回覆。", "zh-TW": "一則合成評論等候回覆。" },
    observedAt: "2026-10-17T00:00:00Z",
  });
  sql(environment.db, `update actions set evidence=${quote(evidence)}::jsonb where id='${merchant.actionId}';`);
});
test.afterEach(async ({ page }) => { expect(deliveriesByTest.get(page)).toEqual([]); });

test("assistant preview remains retryable when saving fails", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await page.getByRole("button", { name: "Generate a draft", exact: true }).click();
  await expect(page.locator("#draft-content")).toHaveValue(/Thank you/, { timeout: 90_000 });
  await page.getByRole("button", { name: "Revise with operator as a new version" }).click();
  await page.getByRole("button", { name: "Make it warmer without overpromising" }).click();
  const save = page.getByRole("button", { name: "Create a new version without overwriting" });
  await expect(save).toBeVisible({ timeout: 90_000 });
  await page.route(`**/api/actions/${merchant.actionId}/versions`, route => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporarily_unavailable" }),
  }));
  await save.click();
  await expect(page.getByRole("alert").filter({ hasText: /not be confirmed as saved/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "New version created" })).toHaveCount(0);
  await expect(save).toBeEnabled();
  expect(sql(environment.db, `select count(*) from output_versions where action_id='${merchant.actionId}';`)).toBe("1");
  await page.screenshot({ path: `${evidenceDir}/after-assistant-save-failure.png`, fullPage: true });
  await page.unroute(`**/api/actions/${merchant.actionId}/versions`);
  const savedResponse = page.waitForResponse(r => r.url().endsWith(`/api/actions/${merchant.actionId}/versions`));
  await save.click();
  const saved = await savedResponse;
  expect(saved.status()).toBe(201);
  const result = await saved.json();
  const retry = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: saved.request().postDataJSON() });
  expect(retry.status()).toBe(201);
  expect(await retry.json()).toMatchObject(result);
  expect(versionCount(environment, merchant)).toBe("2");
});

test("S1 existing brand: recommendation, source/time/limits, first saved draft and explicit exact-version approval", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  const brand = await saveBrand(page, merchant);
  const started = performance.now();
  await page.goto(`/en/owner/${merchant.slug}?location=primary`);
  const reason = page.locator("details.owner-priority-evidence");
  await reason.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(reason).toContainText("One synthetic review is waiting for a reply.");
  await expect(reason).toContainText("Observed");
  await expect(reason).toContainText("Google Business Profile");
  await page.screenshot({ path: `${evidenceDir}/desktop-recommendation.png`, fullPage: true });
  await page.locator(".brief-priority-actions a").click();
  await expect(page).toHaveURL(new RegExp(`/actions/${merchant.actionId}`));
  await page.getByRole("tab", { name: "Source evidence", exact: true }).click();
  await expect(page.locator(".evidence-detail-grid")).toContainText("Revenue, reservations and customer intent are not measured by this action.");
  await page.getByRole("tab", { name: "Draft & approval", exact: true }).click();
  const body = "Thank you for your review. We appreciate your feedback.";
  const saved = await generate(page, merchant, body, environment);
  const elapsedMs = Math.round(performance.now() - started);
  const prompt = (await prompts(environment)).at(-1)!;
  expect(prompt).toContain("Voice: professional");
  expect(prompt).toContain(brand.revisionId);
  expect(prompt).not.toContain("brand_voice: warm");
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator("#draft-content")).toHaveValue(body);
  await page.screenshot({ path: `${evidenceDir}/desktop-saved-draft.png`, fullPage: true });
  await approve(page, merchant, environment, saved.versionNo);
  const repeat = await page.request.post(`/api/versions/${saved.versionId}/approve`, { data: {} });
  expect(repeat.status()).toBe(200);
  expect(sql(environment.db, `select count(*) from audit_events where workspace_id='${merchant.workspaceId}' and event='version.approved';`)).toBe("1");
  const edited = `${body} Please leave any further feedback in this review thread.`;
  await page.locator("#draft-content").fill(edited);
  await expect(page.getByRole("button", { name: "Approve Version 1", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save manual edits as a new version" }).click();
  await expect(page.getByRole("button", { name: "Approve Version 2", exact: true })).toBeEnabled();
  expect(sql(environment.db, `select approval_state || ':' || coalesce(approved_by::text,'none') from output_versions where action_id='${merchant.actionId}' and version_no=2;`)).toBe("draft:none");
  expect(sql(environment.db, `select count(*) from audit_events where workspace_id='${merchant.workspaceId}' and event='version.approved';`)).toBe("1");
  await page.reload(); await waitForHydration(page);
  await expect(page.locator("#draft-content")).toHaveValue(edited);
  await approve(page, merchant, environment, 2);
  record("scenario-1", { result: "PASS", firstSavedDraftMs: elapsedMs, targetMs: 300000, withinTarget: elapsedMs <= 300000, timingKind: "automated fixture operations, not a human usability measurement", brandRevision: brand.revisionId, firstSavedVersion: saved, finalApprovedVersion: 2, editRequiredNewApproval: true });
});

test("S2 incomplete facts: required review is asked for, invented operations are withheld, safe omissions save", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  await saveBrand(page, merchant);
  sql(environment.db, `update actions set provided_inputs='{"language":"en"}', required_inputs='["reviews_without_response"]'::jsonb where id='${merchant.actionId}';`);
  await page.goto(actionPath(merchant));
  const before = (await prompts(environment)).length;
  const requested = page.waitForResponse(r => r.url().endsWith(`/api/actions/${merchant.actionId}/run`));
  await page.getByRole("button", { name: "Generate a draft", exact: true }).click();
  const missing = await requested;
  expect(missing.status()).toBe(200);
  expect((await missing.json()).factsNeeded).toContain("reviews_without_response");
  await expect(page.locator("#input-reviews_without_response")).toBeVisible();
  expect((await prompts(environment)).length).toBe(before);
  expect(versionCount(environment, merchant)).toBe("0");
  await page.locator("#input-reviews_without_response").fill("Thank you for your thoughtful service.");
  await modelOutput(environment, "Thank you! Visit us at 88 Invented Street. Our opening hours are 9am to 10pm. HK$88 offer guarantees doubled sales.");
  const attempt = page.waitForResponse(r => r.url().endsWith(`/api/actions/${merchant.actionId}/run`));
  await page.getByRole("button", { name: "Save inputs and generate", exact: true }).click();
  const rejected = await (await attempt).json();
  expect(rejected.versionId).toBeUndefined();
  expect(versionCount(environment, merchant)).toBe("0");
  await expect(page.getByRole("alert").filter({ hasText: /Last generation failed/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate a draft", exact: true })).toBeEnabled();
  const safe = "Thank you for your kind review. We appreciate you sharing your feedback.";
  const saved = await generate(page, merchant, safe, environment);
  await page.reload(); await waitForHydration(page);
  await expect(page.locator("#draft-content")).toHaveValue(safe);
  await page.screenshot({ path: `${evidenceDir}/desktop-missing-facts-recovered.png`, fullPage: true });
  await approve(page, merchant, environment, saved.versionNo);
  record("scenario-2", { result: "PASS", requiredFactBlockedBeforeModel: true, inventedOutputWithheld: true, savedBody: safe, version: saved });
});

test("S3 selected branch: other branch facts and imported metadata never enter the confirmed drafting context", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  await saveBrand(page, merchant, { location_id: merchant.locationId, address: "12 Branch A Road", hours: "Branch A opens at 9am." });
  sql(environment.db, `update locations set address='99 Imported B Street' where id='${merchant.otherLocationId}';
    update actions set location_id='${merchant.otherLocationId}' where id='${merchant.actionId}';`);
  await page.goto(`${actionPath(merchant)}?location=other`);
  const safe = "Thank you for your review. Your feedback matters to our team.";
  const saved = await generate(page, merchant, safe, environment);
  const prompt = (await prompts(environment)).at(-1)!;
  expect(prompt).toContain(merchant.otherLocationId);
  expect(prompt).not.toContain("12 Branch A Road");
  expect(prompt).not.toContain("Branch A opens at 9am");
  expect(prompt).not.toContain("99 Imported B Street");
  await page.reload(); await waitForHydration(page);
  await expect(page.locator("#draft-content")).toHaveValue(safe);
  await expect(page.locator(".action-detail-page")).toContainText("Other");
  await approve(page, merchant, environment, saved.versionNo);
  record("scenario-3", { result: "PASS", selectedLocation: merchant.otherLocationId, excludedOtherBranchAndImportedAddress: true, version: saved });
});

test("S4 Hong Kong mobile: shorten, tone and CTA revisions save, fresh login reads the exact version and reapproval is explicit", async ({ page, browser, merchant, environment }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, environment, merchant);
  await saveBrand(page, merchant, { location_id: merchant.locationId }, "professional", "zh-HK");
  sql(environment.db, `update actions set provided_inputs='{"brand_voice":"warm","language":"zh-HK","reviews_without_response":"服務細心，多謝。"}' where id='${merchant.actionId}';`);
  await page.goto(actionPath(merchant, "zh-HK"));
  await generate(page, merchant, "多謝你分享意見。我哋重視你嘅回饋，亦感謝你花時間留下評論。", environment, true);
  const revised = [
    { label: "縮短呢則回覆", body: "多謝你嘅評論，我哋好重視你嘅意見。", instruction: "Revision: Make the selected saved reply shorter" },
    { label: "改得更親切，但不要過度承諾", body: "多謝你用心分享！你嘅意見對我哋嚟講好重要。", instruction: "Tone: Rewrite in a warmer, friendlier tone" },
    { label: "改用聯絡方式作下一步", body: "多謝你用心分享！如有其他意見，歡迎留言同我哋講。", instruction: "Revision: Use a contact-only CTA in the selected saved reply" },
  ];
  await saveBrand(page, merchant, { location_id: merchant.locationId }, "direct", "zh-HK");
  for (const [index, revision] of revised.entries()) {
    const previousBody = await page.locator("#draft-content").inputValue();
    await modelOutput(environment, revision.body);
    await page.getByRole("button", { name: "用助理修改並建立新版本" }).click();
    await page.getByRole("button", { name: revision.label, exact: true }).click();
    await expect(page.getByRole("button", { name: "建立新版本（不覆蓋現有內容）" })).toBeVisible({ timeout: 90000 });
    const prompt = (await prompts(environment)).at(-1)!;
    expect(prompt).toContain(revision.instruction);
    expect(prompt).toContain(previousBody);
    expect(prompt).toContain("Voice: direct");
    const saved = page.waitForResponse(r => r.url().endsWith(`/api/actions/${merchant.actionId}/versions`));
    await page.getByRole("button", { name: "建立新版本（不覆蓋現有內容）" }).click();
    expect((await saved).status()).toBe(201);
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("#draft-content")).toHaveValue(revision.body);
    expect(versionCount(environment, merchant)).toBe(String(index + 2));
  }
  await page.locator("#draft-content").fill(`${revised[2].body} 多謝你。`);
  await expect(page.getByRole("button", { name: "核准第 4 版", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "儲存手動修改為新版本", exact: true }).click();
  const finalBody = `${revised[2].body} 多謝你。`;
  await expect(page.locator("#draft-content")).toHaveValue(finalBody);
  await expect(page.getByRole("button", { name: "核准第 5 版", exact: true })).toBeEnabled();
  await page.screenshot({ path: `${evidenceDir}/mobile-saved-revision.png`, fullPage: true });
  expect((await page.request.post("/api/auth/sign-out")).status()).toBe(200);
  const fresh = await browser.newContext({ baseURL: environment.app, viewport: { width: 390, height: 844 } });
  try {
    await fresh.route("**/*", route => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort("blockedbyclient"));
    const other = await fresh.newPage();
    await signIn(other, environment, merchant);
    await other.goto(actionPath(merchant, "zh-HK")); await waitForHydration(other);
    await expect(other.locator("#draft-content")).toHaveValue(finalBody);
    await approve(other, merchant, environment, 5, true);
    await other.screenshot({ path: `${evidenceDir}/mobile-approved-fresh-session.png`, fullPage: true });
    expect(sql(environment.db, `select count(*) from output_versions where action_id='${merchant.actionId}' and approval_state='approved';`)).toBe("1");
  } finally { await fresh.close(); }
  record("scenario-4", { result: "PASS", browser: "Chromium 390x844 viewport, not a real phone or Safari", targetedRevisions: ["shorten", "warmer", "contact-only CTA"], freshFixtureLoginReadback: true, savedBody: finalBody, versions: 5 });
});

test("S5 old tab compares before saving; provider failure preserves drafts and an explicit retry succeeds", async ({ page, context, merchant, environment }) => {
  await signIn(page, environment, merchant);
  await saveBrand(page, merchant);
  await page.goto(actionPath(merchant));
  const v1 = await generate(page, merchant, "Thank you for your review. We appreciate your feedback.", environment);
  const stale = await context.newPage();
  try {
    await stale.goto(actionPath(merchant)); await waitForHydration(stale);
    await stale.locator("#draft-content").fill("My retained local revision. Thank you for your review.");
    await page.locator("#draft-content").fill("A newer saved reply from the first tab.");
    await page.getByRole("button", { name: "Save manual edits as a new version" }).click();
    await expect(page.getByRole("button", { name: "Approve Version 2", exact: true })).toBeEnabled();
    await stale.getByRole("button", { name: "Save manual edits as a new version" }).click();
    await expect(stale.getByText("Another reviewer changed this output", { exact: true })).toBeVisible();
    await stale.getByRole("button", { name: "Load latest safely", exact: true }).click();
    await expect(stale.getByLabel("Latest saved draft for comparison")).toHaveValue("A newer saved reply from the first tab.");
    await expect(stale.locator("#draft-content")).toHaveValue("My retained local revision. Thank you for your review.");
    await stale.screenshot({ path: `${evidenceDir}/desktop-conflict-comparison.png`, fullPage: true });
    await stale.getByRole("button", { name: "Keep my edits over Version 2" }).click();
    await stale.getByRole("button", { name: "Save manual edits as a new version" }).click();
    await expect(stale.getByRole("button", { name: "Approve Version 3", exact: true })).toBeEnabled();
    expect((await stale.request.post(`/api/versions/${v1.versionId}/approve`, { data: {} })).status()).toBe(409);
    await fetch(`${environment.llm}/mode`, { method: "POST", body: "unavailable" });
    await modelOutput(environment, null);
    const failed = await stale.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } });
    expect(failed.status()).toBe(200);
    expect((await failed.json()).versionId).toBeUndefined();
    expect(versionCount(environment, merchant)).toBe("3");
    await stale.reload(); await waitForHydration(stale);
    await expect(stale.locator("#draft-content")).toHaveValue("My retained local revision. Thank you for your review.");
    await fetch(`${environment.llm}/mode`, { method: "POST", body: "success" });
    const saved = await generate(stale, merchant, "Thank you for your feedback. Please leave a comment with any further thoughts.", environment);
    expect(saved.versionNo).toBe(4);
    await stale.reload(); await waitForHydration(stale);
    await expect(stale.locator("#draft-content")).toHaveValue("Thank you for your feedback. Please leave a comment with any further thoughts.");
    await approve(stale, merchant, environment, 4);
    record("scenario-5", { result: "PASS", conflictComparedAndExplicitlyRebased: true, staleApprovalRefused: true, providerFailureRetainedVersion: 3, retryVersion: saved.versionNo });
  } finally { await stale.close(); }
});

test("API boundaries: active generation is unique, cross-workspace and non-approver requests fail closed", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  await saveBrand(page, merchant);
  const countBefore = (await prompts(environment)).length;
  await fetch(`${environment.llm}/hold`, { method: "POST" });
  const first = page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } });
  try {
    await expect(async () => expect((await prompts(environment)).length).toBe(countBefore + 1)).toPass();
    const concurrent = await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } });
    expect(concurrent.status()).toBe(409);
    expect((await concurrent.json()).error).toBe("run_in_progress");
    expect((await prompts(environment)).length).toBe(countBefore + 1);
  } finally { await fetch(`${environment.llm}/release`, { method: "POST" }); }
  const saved = await first;
  expect(saved.status()).toBe(200);
  const version = await saved.json();
  expect(versionCount(environment, merchant)).toBe("1");
  const other = await seedMerchant(environment, "hk");
  await page.request.post("/api/auth/sign-out");
  await signIn(page, environment, other);
  for (const response of [
    await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } }),
    await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: "Foreign change", base_version_id: version.versionId } }),
    await page.request.post(`/api/versions/${version.versionId}/approve`, { data: {} }),
    await page.request.post("/api/assistant/run", { data: { mode: "live", surface: "action", intentId: "shorten_review_reply", locale: "en", context: { workspaceId: other.workspaceId, actionId: merchant.actionId, versionId: version.versionId } } }),
  ]) {
    expect([403, 404]).toContain(response.status());
    expect(await response.text()).not.toContain("Thank you for your review");
  }
  await page.request.post("/api/auth/sign-out");
  await signIn(page, environment, merchant, "viewer");
  expect((await page.request.post(`/api/versions/${version.versionId}/approve`, { data: {} })).status()).toBe(403);
  expect((await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: "Viewer change", base_version_id: version.versionId } })).status()).toBe(403);
  expect(versionCount(environment, merchant)).toBe("1");
  expect(sql(environment.db, `select approval_state from output_versions where id='${version.versionId}';`)).toBe("draft");
  expect(sql(environment.db, `select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  record("api-boundaries", { result: "PASS", concurrentModelCalls: 1, duplicateVersionRows: 0, crossWorkspaceRefused: true, viewerApprovalRefused: true, deliveryUsage: 0 });
});

test("a lost generation response is reconciled by reading the saved draft instead of another model call", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  await saveBrand(page, merchant);
  await page.goto(actionPath(merchant));
  const before = (await prompts(environment)).length;
  await page.route(`**/api/actions/${merchant.actionId}/run`, async route => {
    const completed = await route.fetch();
    expect(completed.status()).toBe(200);
    await route.abort("failed");
  });
  const button = page.getByRole("button", { name: "Generate a draft", exact: true });
  await button.click();
  await expect(page.getByText("The generation outcome is not confirmed", { exact: true })).toBeVisible();
  await expect(button).toBeDisabled();
  await page.screenshot({ path: `${evidenceDir}/generation-readback-required.png`, fullPage: true });
  expect(versionCount(environment, merchant)).toBe("1");
  expect((await prompts(environment)).length).toBe(before + 1);
  await page.getByRole("button", { name: "Reload draft and run status", exact: true }).click();
  await waitForHydration(page);
  await expect(page.locator("#draft-content")).toHaveValue("Thank you for your review. We appreciate your feedback.");
  expect((await prompts(environment)).length).toBe(before + 1);
  expect(versionCount(environment, merchant)).toBe("1");
  record("lost-generation-response", { result: "PASS", modelCalls: 1, savedVersions: 1, explicitReadbackRequired: true });
});
