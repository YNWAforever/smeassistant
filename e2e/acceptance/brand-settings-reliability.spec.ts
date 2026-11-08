import type { Page } from "@playwright/test";
import { test, expect, signIn, waitForHydration } from "../../test/e2e/fixtures";
import { sql, type AcceptanceEnvironment } from "../../test/e2e/environment";
import { seedMerchant, type MerchantSeed } from "../../test/e2e/seed";

const body = { voice: "direct", approved_claims: ["Established 1998"], prohibited_terms: ["Guaranteed"], languages: ["en"], facts: { hours: "11-22" }, expectedRevisionId: null };
const settingsPath = (merchant: MerchantSeed) => `/en/owner/${merchant.slug}/business/profile`;
const apiPath = (merchant: MerchantSeed) => `/api/workspaces/${merchant.workspaceId}/brand`;
function seedBrand(environment: AcceptanceEnvironment, merchant: MerchantSeed, voice: "professional" | "unknown" = "professional") {
  sql(environment.db, `insert into brand_profiles(workspace_id,voice,approved_claims,prohibited_terms,languages,facts)
    values ('${merchant.workspaceId}','${voice}',array['Established 1998'],array['Guaranteed'],array['en'],'{"hours":"11-22"}');`);
}
async function chooseVoice(page: Page, label: string) {
  await page.getByRole("combobox", { name: "Choose voice" }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
async function save(page: Page) {
  const saved = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith("/brand"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  return saved;
}

test("owner saves voice through the existing API and a fresh signed-in browser reads the persisted profile", async ({ page, browser, merchant, environment }) => {
  seedBrand(environment, merchant);
  await signIn(page, environment, merchant);
  await page.goto(settingsPath(merchant));
  await chooseVoice(page, "Short and direct");
  const saved = await save(page);
  expect(saved.status()).toBe(200);
  const persisted = await saved.json();
  expect(persisted.brand).toMatchObject({ workspaceId: merchant.workspaceId, voice: "direct", voiceConfigured: true, facts: { hours: "11-22" }, languages: ["en"], prohibitedTerms: ["Guaranteed"] });
  expect(persisted.brand.revisionId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(sql(environment.db, `select voice from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("direct");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("brand-owner-saved.png"), fullPage: true });

  const fresh = await browser.newContext({ baseURL: environment.app });
  try {
    await fresh.route("**/*", route => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort("blockedbyclient"));
    const freshPage = await fresh.newPage();
    await signIn(freshPage, environment, merchant);
    await freshPage.goto(settingsPath(merchant));
    await waitForHydration(freshPage);
    await expect(freshPage.getByRole("combobox", { name: "Choose voice" })).toHaveText(/Short and direct/);
    await expect(freshPage.getByLabel("Lines you're happy to say (one per line)")).toHaveValue("Established 1998");
    await expect(freshPage.getByLabel("Words never to use (one per line)")).toHaveValue("Guaranteed");
    await expect(freshPage.getByLabel("Value", { exact: true })).toHaveValue("11-22");
    expect((await (await freshPage.request.get(apiPath(merchant))).json()).brand.revisionId).toBe(persisted.brand.revisionId);
    expect(sql(environment.db, `select count(*) from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("1");
    await freshPage.screenshot({ path: test.info().outputPath("brand-fresh-context.png"), fullPage: true });
  } finally { await fresh.close(); }
});

test("failed save retains all inputs and retry reaches the real API once", async ({ page, merchant, environment }) => {
  seedBrand(environment, merchant);
  await signIn(page, environment, merchant);
  await page.goto(settingsPath(merchant));
  let failed = false;
  await page.route(`**${apiPath(merchant)}`, async route => {
    if (route.request().method() === "PUT" && !failed) {
      failed = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
    } else await route.continue();
  });
  await chooseVoice(page, "Short and direct");
  await page.getByLabel("Lines you're happy to say (one per line)").fill("Draft claim retained");
  await page.getByLabel("Words never to use (one per line)").fill("No promises");
  await page.getByLabel("Value", { exact: true }).fill("12-23");
  expect((await save(page)).status()).toBe(503);
  await expect(page.locator(".brand-page").getByRole("alert")).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Choose voice" })).toHaveText(/Short and direct/);
  await expect(page.getByLabel("Lines you're happy to say (one per line)")).toHaveValue("Draft claim retained");
  await expect(page.getByLabel("Words never to use (one per line)")).toHaveValue("No promises");
  await expect(page.getByLabel("Value", { exact: true })).toHaveValue("12-23");
  expect(sql(environment.db, `select voice from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("professional");
  const retry = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith("/brand"));
  await page.getByRole("button", { name: "Retry save" }).click();
  expect((await retry).status()).toBe(200);
  expect(sql(environment.db, `select count(*) from brand_revisions where workspace_id='${merchant.workspaceId}' and source='save';`)).toBe("1");
  const actual = (await (await page.request.get(apiPath(merchant))).json()).brand;
  expect(actual).toMatchObject({ voice: "direct", approvedClaims: ["Draft claim retained"], prohibitedTerms: ["No promises"], languages: ["en"], facts: { hours: "12-23" } });
});

test("two open settings pages enforce CAS and retain the losing draft until the owner reviews the latest version", async ({ page, context, merchant, environment }) => {
  seedBrand(environment, merchant);
  await signIn(page, environment, merchant);
  await page.goto(settingsPath(merchant));
  const stale = await context.newPage();
  try {
    await stale.goto(settingsPath(merchant));
    await waitForHydration(stale);
    await stale.getByLabel("Lines you're happy to say (one per line)").fill("Retained stale draft");
    await chooseVoice(page, "Short and direct");
    expect((await save(page)).status()).toBe(200);
    const head = (await (await page.request.get(apiPath(merchant))).json()).brand.revisionId;
    expect((await save(stale)).status()).toBe(409);
    await expect(stale.locator(".brand-page").getByRole("alert")).toContainText("Someone else saved");
    await expect(stale.getByLabel("Lines you're happy to say (one per line)")).toHaveValue("Retained stale draft");
    await expect(stale.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    expect((await (await page.request.get(apiPath(merchant))).json()).brand.revisionId).toBe(head);
    await stale.getByRole("button", { name: "Review latest profile" }).click();
    await expect(stale.getByRole("region", { name: "Latest saved profile" })).toContainText("Short and direct");
    await expect(stale.getByLabel("Lines you're happy to say (one per line)")).toHaveValue("Retained stale draft");
    await stale.getByRole("button", { name: "Use latest profile and replace my draft" }).click();
    await expect(stale.getByLabel("Lines you're happy to say (one per line)")).toHaveValue("Established 1998");
    await stale.getByLabel("Lines you're happy to say (one per line)").fill("Reviewed new claim");
    const afterReview = await save(stale);
    expect(afterReview.status()).toBe(200);
    expect(afterReview.request().postDataJSON().expectedRevisionId).toBe(head);
    expect((await (await page.request.get(apiPath(merchant))).json()).brand.approvedClaims).toEqual(["Reviewed new claim"]);
    await stale.screenshot({ path: test.info().outputPath("brand-conflict-reviewed.png"), fullPage: true });
  } finally { await stale.close(); }
});

for (const role of ["manager", "viewer"] as const) {
  test(`${role} can read settings with an explanation and cannot PUT the profile`, async ({ page, merchant, environment }) => {
    seedBrand(environment, merchant);
    await signIn(page, environment, merchant, role);
    await page.goto(settingsPath(merchant));
    await expect(page.getByText(role === "viewer" ? "You can look; ask the owner to make changes." : "You can read the business profile. Only the owner can save changes.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask the owner to change it", exact: true })).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Choose voice" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    expect((await page.request.get(apiPath(merchant))).status()).toBe(200);
    expect((await page.request.put(apiPath(merchant), { data: body })).status()).toBe(403);
    expect(sql(environment.db, `select voice from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("professional");
  });
}

test("switching to another account and workspace clears the old draft and denies cross-account GET and PUT", async ({ page, merchant, environment }) => {
  const other = await seedMerchant(environment, "tw");
  seedBrand(environment, merchant);
  seedBrand(environment, other);
  await signIn(page, environment, merchant);
  await page.goto(settingsPath(merchant));
  await page.getByLabel("Lines you're happy to say (one per line)").fill("Private old-account draft");
  expect((await page.request.post("/api/auth/sign-out")).status()).toBe(200);
  await signIn(page, environment, other);
  await page.goto(settingsPath(other));
  await expect(page.getByLabel("Lines you're happy to say (one per line)")).toHaveValue("Established 1998");
  await expect(page.getByText("Private old-account draft", { exact: true })).toHaveCount(0);
  expect((await page.request.get(apiPath(merchant))).status()).toBe(403);
  expect((await page.request.put(apiPath(merchant), { data: body })).status()).toBe(403);
  expect((await page.request.get(apiPath(other))).status()).toBe(200);
  expect(sql(environment.db, `select voice from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("professional");
});

for (const voice of ["missing profile", "unknown"] as const) {
  test(`${voice} voice stays unset until the owner explicitly selects a valid voice`, async ({ page, merchant, environment }) => {
    if (voice === "unknown") seedBrand(environment, merchant, voice);
    await signIn(page, environment, merchant);
    await page.goto(settingsPath(merchant));
    await expect(page.getByRole("combobox", { name: "Choose voice" })).toHaveText(/Choose a voice/);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".brand-page").getByRole("alert")).toContainText("Choose a voice");
    expect(sql(environment.db, `select count(*) from brand_revisions where workspace_id='${merchant.workspaceId}' and source='save';`)).toBe("0");
    await chooseVoice(page, "Short and direct");
    expect((await save(page)).status()).toBe(200);
    const persisted = (await (await page.request.get(apiPath(merchant))).json()).brand;
    expect(persisted).toMatchObject({
      voice: "direct", voiceConfigured: true,
      approvedClaims: voice === "unknown" ? ["Established 1998"] : [],
      facts: voice === "unknown" ? { hours: "11-22" } : {},
    });
  });
}
