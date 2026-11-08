import { randomUUID } from "node:crypto";
import { test, expect, signIn, waitForHydration } from "../../test/e2e/fixtures";
import { sql, type AcceptanceEnvironment } from "../../test/e2e/environment";
import type { MerchantSeed } from "../../test/e2e/seed";

test.use({ trace: "off", video: "off" });

function seedReport(env: AcceptanceEnvironment, merchant: MerchantSeed, fresh = false) {
  const id = randomUUID(), slug = `resume-${id.slice(0, 12)}`;
  if (fresh) {
    sql(env.db, `delete from actions where id='${merchant.actionId}';
      delete from locations where id in ('${merchant.locationId}','${merchant.otherLocationId}');`);
  }
  sql(env.db, `insert into audit_jobs(id,share_slug,business_name,region,status,workspace_id,location_id,overall_score,score_coverage,module_results,input_snapshot,completed_at)
    values ('${id}','${slug}','Synthetic onboarding business','hk','done','${merchant.workspaceId}',${fresh ? "null" : `'${merchant.locationId}'`},null,0.35,
    '{"ig":{"status":"unavailable","score":null},"gbp":{"status":"measured","score":62,"confidence":"high"},"aeo":{"status":"unavailable","score":null},"trust":{"status":"unsupported","score":null}}',
    '{"address":"12 Fixture Road"}',now());
    insert into audit_findings(job_id,finding_key,module,severity,score_impact,owner_message_en,owner_action_en,evidence)
    values ('${id}','gbp.owner_response_low','gbp','warning',-10,'Captured fixture reviews need a response','Review an unanswered review','{"sampled":5,"unanswered":3}');`);
  return { id, slug };
}
function seedBrand(env: AcceptanceEnvironment, merchant: MerchantSeed, voice = "professional") {
  sql(env.db, `insert into brand_profiles(workspace_id,voice,approved_claims,prohibited_terms,languages,facts)
    values ('${merchant.workspaceId}','${voice}',array['Existing confirmed fixture claim'],array['Preserved forbidden phrase'],array['en'],'{"fixture_fact":"Preserved fact"}');`);
}

for (const item of [
  { locale: "en", width: 1440, back: "Back", next: "Continue", access: "Verify ownership", essentials: "Business basics", finish: "Finish and see results", more: "More settings (optional)", voice: "Concise and professional", brandLink: "Open business profile" },
  { locale: "zh-HK", width: 390, back: "返回", next: "繼續", access: "驗證擁有權", essentials: "商戶基本資料", finish: "完成並查看結果", more: "更多設定（選填）", voice: "簡潔、專業", brandLink: "開啟商戶資料" },
  { locale: "zh-TW", width: 390, back: "返回", next: "繼續", access: "驗證擁有權", essentials: "店家基本資料", finish: "完成並查看結果", more: "更多設定（選填）", voice: "簡潔、專業", brandLink: "開啟店家資料" },
]) {
  test(`existing brand stays read-only and survives another-tab update (${item.locale})`, async ({ page, merchant, environment }, info) => {
    const job = seedReport(environment, merchant);
    seedBrand(environment, merchant);
    await signIn(page, environment, merchant);
    await page.setViewportSize({ width: item.width, height: 900 });
    await page.goto(`/${item.locale}/owner/onboarding?claim=${job.slug}`);
    const summary = page.getByRole("region", { name: item.locale === "en" ? "Saved brand settings" : "已儲存的品牌設定" });
    await expect(summary.getByText(item.voice, { exact: true })).toBeVisible();
    await expect(page.locator("#onboarding-voice")).toHaveCount(0);
    await expect(page.locator("#approved-claims")).toHaveCount(0);
    await expect(summary.getByRole("link", { name: item.brandLink })).toHaveAttribute("href", `/${item.locale}/owner/${merchant.slug}/business/profile`);
    const screenshot = info.outputPath(`existing-brand-${item.locale}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await info.attach("Existing brand read-only summary", { path: screenshot, contentType: "image/png" });

    // Follow the locale/workspace-correct link in a second tab. Its real save
    // must survive the stale onboarding submission, including on mobile.
    const other = await page.context().newPage();
    await other.setViewportSize({ width: item.width, height: 900 });
    await other.goto(`/${item.locale}/owner/${merchant.slug}/business/profile`);
    await waitForHydration(other);
    await other.getByRole("combobox", { name: item.locale === "en" ? "Choose voice" : "選擇語氣" }).click();
    await other.getByRole("option", { name: item.locale === "en" ? "Short and direct" : "簡短直接", exact: true }).click();
    await other.getByLabel(item.locale === "en" ? "Lines you're happy to say (one per line)" : item.locale === "zh-TW" ? "你願意說的句子（每行一句）" : "你肯講嘅句子（每行一句）").fill("New confirmed fixture claim");
    const updated = other.waitForResponse(r => r.url().endsWith(`/api/workspaces/${merchant.workspaceId}/brand`) && r.request().method() === "PUT");
    await other.getByRole("button", { name: item.locale === "en" ? "Save" : "儲存", exact: true }).click();
    const update = await updated;
    expect(update.status()).toBe(200);
    await expect(other.getByText(item.locale === "en" ? "Saved." : "已儲存。", { exact: true })).toBeVisible();
    await other.screenshot({ path: info.outputPath(`brand-settings-saved-${item.locale}.png`), fullPage: true });
    await other.close();
    const completion = page.waitForResponse(r => r.url().endsWith("/api/workspaces/claim") && r.request().method() === "POST");
    await page.getByRole("button", { name: item.finish, exact: true }).click();
    const saved = await completion;
    expect(saved.status()).toBe(200);
    const body = saved.request().postDataJSON();
    expect(body).not.toHaveProperty("brand_voice");
    expect(body).not.toHaveProperty("approved_claims");
    await expect(page).toHaveURL(new RegExp(`/${item.locale}/owner/${merchant.slug}$`));
    expect(sql(environment.db, `select voice from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("direct");
    expect(sql(environment.db, `select approved_claims[1] from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("New confirmed fixture claim");
    expect(sql(environment.db, `select facts->>'fixture_fact' from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("Preserved fact");
    expect(sql(environment.db, `select count(*) from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("1");
    expect(sql(environment.db, `select count(*) from locations where workspace_id='${merchant.workspaceId}';`)).toBe("2");
    expect(sql(environment.db, `select count(*) from scan_snapshots where job_id='${job.id}';`)).toBe("1");
    await page.goto(`/${item.locale}/owner/onboarding?claim=${job.slug}`);
    await expect(summary.getByText(item.locale === "en" ? "Direct and matter-of-fact" : "直接、務實", { exact: true })).toBeVisible();
  });

  test(`new business uses keyboard navigation and saves a chosen voice only on completion (${item.locale})`, async ({ page, merchant, environment }, info) => {
    const job = seedReport(environment, merchant, true);
    await signIn(page, environment, merchant);
    await page.setViewportSize({ width: item.width, height: 900 });
    await page.goto(`/${item.locale}/owner/onboarding?claim=${job.slug}`);
    let submissions = 0;
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/api/workspaces/claim" && request.method() === "POST") submissions++;
    });
    await page.getByRole("button", { name: item.back, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: item.access, exact: true })).toBeFocused();
    await page.getByRole("button", { name: item.next, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: item.essentials, exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: item.finish, exact: true })).toBeEnabled();
    expect(submissions).toBe(0);
    expect(sql(environment.db, `select count(*) from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("0");
    await page.locator("#workspace-name").fill("Keyboard confirmed fixture");
    await page.getByText(item.more, { exact: true }).click();
    await page.locator("#onboarding-voice").click();
    await page.getByRole("option", { name: item.voice, exact: true }).click();
    await page.locator("#approved-claims").fill("Confirmed synthetic claim");
    await page.locator("#approved-claims").press("Enter");
    expect(submissions).toBe(0);
    await expect(page.locator("#approved-claims")).toHaveValue("Confirmed synthetic claim\n");
    const before = info.outputPath(`new-brand-before-finish-${item.locale}.png`);
    await page.screenshot({ path: before, fullPage: true });
    await info.attach("New brand editable before explicit completion", { path: before, contentType: "image/png" });
    const completion = page.waitForResponse(r => r.url().endsWith("/api/workspaces/claim") && r.request().method() === "POST");
    // Enter in the single-line business field is an explicit form completion.
    await page.locator("#workspace-name").press("Enter");
    expect((await completion).status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/${item.locale}/owner/${merchant.slug}$`));
    expect(submissions).toBe(1);
    expect(sql(environment.db, `select voice from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("professional");
    expect(sql(environment.db, `select count(*) from locations where workspace_id='${merchant.workspaceId}';`)).toBe("1");
    expect(sql(environment.db, `select count(*) from scan_snapshots where job_id='${job.id}';`)).toBe("1");
    expect(sql(environment.db, `select count(*) from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("1");
    await expect(page.locator(".brief-priority-card h2")).not.toBeEmpty();
    await page.reload();
    await expect(page.locator(".brief-priority-card h2")).not.toBeEmpty();
    const after = info.outputPath(`new-brand-result-${item.locale}.png`);
    await page.screenshot({ path: after, fullPage: true });
    await info.attach("New business first persisted result", { path: after, contentType: "image/png" });
    await page.goto(`/${item.locale}/r/${job.slug}`);
    await expect(page.getByRole("heading", { name: /Score withheld|評分暫不顯示|分數暫不顯示/ })).toBeVisible();
    await expect(page.locator("body")).toContainText("35%");
  });
}

test("existing brand with no supported voice stays unset and preserves its other fields", async ({ page, merchant, environment }, info) => {
  const job = seedReport(environment, merchant);
  // The schema disallows NULL. Empty legacy text represents an unset voice
  // without changing constraints or inventing a default.
  seedBrand(environment, merchant, "");
  await signIn(page, environment, merchant);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/zh-HK/owner/onboarding?claim=${job.slug}`);
  await expect(page.getByRole("region", { name: "已儲存的品牌設定" })).toContainText("未設定");
  await expect(page.locator("#onboarding-voice")).toHaveCount(0);
  const image = info.outputPath("existing-brand-unset.png");
  await page.screenshot({ path: image, fullPage: true });
  await info.attach("Existing unset brand", { path: image, contentType: "image/png" });
  const completion = page.waitForResponse(r => r.url().endsWith("/api/workspaces/claim") && r.request().method() === "POST");
  await page.getByRole("button", { name: "完成並查看結果", exact: true }).click();
  expect((await completion).status()).toBe(200);
  expect(sql(environment.db, `select length(voice) from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  expect(sql(environment.db, `select facts->>'fixture_fact' from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("Preserved fact");
});

test("failed completion keeps fields and focus, and a double-click retry creates no duplicate records", async ({ page, merchant, environment }) => {
  const job = seedReport(environment, merchant, true);
  await signIn(page, environment, merchant);
  await page.goto(`/en/owner/onboarding?claim=${job.slug}`);
  await page.locator("#workspace-name").fill("Retry fixture name");
  let submissions = 0;
  await page.route(`${environment.app}/api/workspaces/claim`, route => {
    submissions++;
    return submissions === 1 ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"fixture_unavailable"}' }) : route.continue();
  });
  await page.getByRole("button", { name: "Finish and see results", exact: true }).click();
  await expect(page.locator(".onboarding-card").getByRole("alert")).toBeFocused();
  await expect(page.locator("#workspace-name")).toHaveValue("Retry fixture name");
  expect(sql(environment.db, `select count(*) from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  await page.getByRole("button", { name: "Finish and see results", exact: true }).dblclick();
  await expect(page).toHaveURL(new RegExp(`/en/owner/${merchant.slug}$`));
  expect(submissions).toBe(2); // one rejected transport, one explicit successful retry
  expect(sql(environment.db, `select count(*) from locations where workspace_id='${merchant.workspaceId}';`)).toBe("1");
  expect(sql(environment.db, `select count(*) from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("1");
  expect(sql(environment.db, `select count(*) from scan_snapshots where job_id='${job.id}';`)).toBe("1");
});

test("a viewer cannot use onboarding to read or change the owner's brand", async ({ page, merchant, environment }) => {
  const job = seedReport(environment, merchant);
  seedBrand(environment, merchant);
  await signIn(page, environment, merchant, "viewer");
  await page.goto(`/en/owner/onboarding?claim=${job.slug}`);
  await expect(page.getByRole("region", { name: "Saved brand settings" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open business profile" })).toHaveCount(0);
  await expect(page.locator("#workspace-name")).toHaveCount(0);
  const denied = await page.request.post("/api/workspaces/claim", { data: {
    claim_slug: job.slug, workspace_name: "Forbidden fixture", primary_location: { name: "Forbidden" },
    market: "hk", locale: "en", brand_voice: "direct",
  } });
  expect(denied.status()).toBe(403);
  expect(sql(environment.db, `select voice from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("professional");
});
