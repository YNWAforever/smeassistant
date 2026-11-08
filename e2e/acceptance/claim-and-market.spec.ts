import { randomBytes, randomUUID } from "node:crypto";
import { test, expect, requestSignInLink, signIn } from "../../test/e2e/fixtures";
import { sql, type AcceptanceEnvironment } from "../../test/e2e/environment";
import { seedMerchant, type MerchantSeed } from "../../test/e2e/seed";

function report(env: AcceptanceEnvironment, merchant: MerchantSeed, market: "hk" | "tw", attached: boolean) {
  const id = randomUUID(), slug = `claim-${id.slice(0, 12)}`;
  sql(env.db, `insert into audit_jobs(id,share_slug,business_name,region,status,workspace_id,location_id,overall_score,score_coverage,module_results,completed_at) values ('${id}','${slug}','Acceptance business','${market}','done',${attached ? `'${merchant.workspaceId}'` : "null"},${attached ? `'${merchant.locationId}'` : "null"},62,78,'{"ig":{"status":"unavailable","score":null},"gbp":{"status":"measured","score":70}}',now()); insert into leads(job_id,email) values ('${id}','${merchant.emails.owner}');`);
  return { id, slug };
}

test("T-03 legal mixed-case underscore slug survives sign-in and onboarding without granting ownership", async ({ page, merchant, environment }) => {
  const job = report(environment, merchant, "hk", false), slug = "3cuOKFmHdiYf00BOs27E_NO1";
  sql(environment.db, `update audit_jobs set share_slug='${slug}' where id='${job.id}';`);
  const link = await requestSignInLink(page, environment, merchant, "owner", slug);
  await page.goto(link);
  await expect(page).toHaveURL(/claimed=requires_verification/);
  await page.goto(`/en/owner/onboarding?claim=${slug}`);
  await expect(page.locator(".onboarding-card")).toContainText("Acceptance business");
  await expect(page.getByText("Ask Fimmick to assign your workspace")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("claim")).toBe(slug);
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View scan report", exact: true })).toHaveAttribute("href", `/en/r/${slug}`);
  expect(sql(environment.db, `select count(*) from audit_jobs where id='${job.id}' and workspace_id is null;`)).toBe("1");
  expect(sql(environment.db, `select count(*) from scan_snapshots where job_id='${job.id}';`)).toBe("0");
});

test("T-15 attached owner resumes persisted brand setup and repeats completion without changing membership", async ({ page, merchant, environment }) => {
  const job = report(environment, merchant, "hk", true);
  await signIn(page, environment, merchant);
  await page.goto(`/en/owner/onboarding?claim=${job.slug}`);
  await expect(page.locator(".step-kicker")).toHaveText("Step 3 of 3");
  await expect(page.locator("#workspace-name")).toHaveValue("Acceptance HK");
  await page.locator("#workspace-name").fill("Saved HK fixture");
  const completion = page.waitForResponse(r => r.url().endsWith("/api/workspaces/claim") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Finish and see results", exact: true }).click();
  expect((await completion).status()).toBe(200);
  await page.goto(`/en/owner/onboarding?claim=${job.slug}`);
  await expect(page.locator(".step-kicker")).toHaveText("Step 3 of 3");
  await expect(page.locator("#workspace-name")).toHaveValue("Saved HK fixture");
  expect(sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and role='owner' and accepted_at is not null;`)).toBe("1");
  expect(sql(environment.db, `select count(*) from scan_snapshots where job_id='${job.id}';`)).toBe("1");
});

for (const { locale, finish } of [
  { locale: "en", finish: "Finish and see results" },
  { locale: "zh-HK", finish: "完成並查看結果" },
  { locale: "zh-TW", finish: "完成並查看結果" },
]) test(`new owner completes essentials and sees the first evidence-backed result (${locale})`, async ({ page, merchant, environment }, testInfo) => {
  // All rows belong to this test's fresh, labelled disposable database. Start
  // with staff-assigned ownership but no location, brand, snapshot or draft.
  sql(environment.db, `delete from actions where workspace_id='${merchant.workspaceId}'; delete from locations where workspace_id='${merchant.workspaceId}';`);
  const jobId = randomUUID(), slug = `onboarding-${jobId.slice(0, 12)}`;
  sql(environment.db, `insert into audit_jobs(id,share_slug,business_name,district,region,status,workspace_id,overall_score,score_coverage,module_results,input_snapshot,completed_at)
    values ('${jobId}','${slug}','Fixture Bakery','Central','hk','done','${merchant.workspaceId}',62,0.6,
    '{"ig":{"status":"unavailable","score":null},"gbp":{"status":"measured","score":62,"confidence":"high"},"aeo":{"status":"measured","score":62,"confidence":"high"}}',
    '{"address":"12 Fixture Road","placeId":"onboarding-fixture-place"}',now());
    insert into audit_findings(job_id,finding_key,module,severity,score_impact,owner_message_en,owner_action_en,evidence)
    values ('${jobId}','gbp.owner_response_low','gbp','warning',-10,'Scan found unanswered reviews','Reply to an unanswered review','{"sampled":5,"unanswered":3}');`);
  await signIn(page, environment, merchant);
  await page.setViewportSize(locale === "en" ? { width: 1280, height: 900 } : { width: 390, height: 844 });
  await page.goto(`/${locale}/owner/onboarding?claim=${slug}`);
  await expect(page.locator(".step-kicker")).toHaveText(locale === "en" ? "Step 3 of 3" : "第 3 步，共 3 步");
  await expect(page.locator("#primary-address")).toHaveValue("12 Fixture Road");
  await expect(page.locator("#instagram-handle")).toHaveCount(0);
  await expect(page.locator(".onboarding-form > details")).not.toHaveAttribute("open");
  const submittedSetups: unknown[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/workspaces/claim" && request.method() === "POST") {
      submittedSetups.push(request.postDataJSON());
    }
  });
  // A real browser runs the click's default action after React updates the
  // step. Continue must not become the newly rendered form's submit button.
  await page.getByRole("button", { name: locale === "en" ? "Back" : "返回", exact: true }).click();
  await expect(page.locator(".step-kicker")).toHaveText(locale === "en" ? "Step 2 of 3" : "第 2 步，共 3 步");
  await page.getByRole("button", { name: locale === "en" ? "Continue" : "繼續", exact: true }).click();
  await expect(page.locator(".step-kicker")).toHaveText(locale === "en" ? "Step 3 of 3" : "第 3 步，共 3 步");
  await expect(page.getByRole("button", { name: finish, exact: true })).toBeEnabled();
  expect(submittedSetups).toHaveLength(0);
  expect(sql(environment.db, `select count(*) from scan_snapshots where job_id='${jobId}';`)).toBe("0");
  expect(sql(environment.db, `select count(*) from locations where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  await page.locator("#workspace-name").fill("Confirmed Fixture Bakery");
  await page.locator("#primary-address").fill("24 Confirmed Fixture Road");
  await expect(page.getByRole("button", { name: finish, exact: true })).toBeVisible();
  const onboardingScreenshot = testInfo.outputPath(`onboarding-${locale}.png`);
  await page.screenshot({ path: onboardingScreenshot, fullPage: true });
  await testInfo.attach("Prefilled essentials", { path: onboardingScreenshot, contentType: "image/png" });
  const completion = page.waitForResponse(r => r.url().endsWith("/api/workspaces/claim") && r.request().method() === "POST");
  await page.getByRole("button", { name: finish, exact: true }).click();
  expect((await completion).status()).toBe(200);
  expect(submittedSetups).toHaveLength(1);
  await expect(page).toHaveURL(new RegExp(`/${locale}/owner/${merchant.slug}$`));
  // This is the real owner component reading the newly persisted snapshot and
  // derived action, rather than a mocked success page.
  await expect(page.locator(".brief-priority-card h2")).not.toBeEmpty();
  await expect(page.locator(".brief-priority-card a")).toHaveAttribute("href", /\/actions\//);
  const priorityTitle = await page.locator(".brief-priority-card h2").innerText();
  expect(priorityTitle).not.toMatch(/No action|沒有需要/);
  expect(sql(environment.db, `select count(*) from scan_snapshots where job_id='${jobId}';`)).toBe("1");
  expect(sql(environment.db, `select count(*) from locations where workspace_id='${merchant.workspaceId}';`)).toBe("1");
  expect(sql(environment.db, `select count(*) from actions where workspace_id='${merchant.workspaceId}' and template_key='review-response';`)).toBe("1");
  expect(sql(environment.db, `select market from workspaces where id='${merchant.workspaceId}';`)).toBe("hk");
  expect(sql(environment.db, `select count(*) from output_versions v join actions a on a.id=v.action_id where a.workspace_id='${merchant.workspaceId}';`)).toBe("0");
  expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  await page.goto(`/${locale}/owner/onboarding?claim=${slug}`);
  await expect(page.locator("#workspace-name")).toHaveValue("Confirmed Fixture Bakery");
  await expect(page.locator("#primary-address")).toHaveValue("24 Confirmed Fixture Road");
  expect(submittedSetups).toHaveLength(1);
  expect(sql(environment.db, `select count(*) from scan_snapshots where job_id='${jobId}';`)).toBe("1");
  await page.goto(`/${locale}/owner/${merchant.slug}`);
  await expect(page.locator(".brief-priority-card h2")).toHaveText(priorityTitle);
  const resultScreenshot = testInfo.outputPath(`first-result-${locale}.png`);
  await page.screenshot({ path: resultScreenshot, fullPage: true });
  await testInfo.attach("First evidence-backed result", { path: resultScreenshot, contentType: "image/png" });
});

for (const attached of [true, false]) test(`verified Auth claim callback: ${attached ? "existing assigned owner succeeds" : "unassigned report requires ownership verification"}`, async ({ page, merchant, environment }) => {
  // Existing staff/OAuth assignment is fixture state, never a self-service bypass.
  const job = report(environment, merchant, "hk", attached);
  const body = { claim_slug: job.slug, workspace_name: "Acceptance HK", primary_location: { name: "Primary" }, market: "hk", locale: "en" };
  expect((await page.request.post("/api/workspaces/claim", { data: body })).status()).toBe(401);
  const link = await requestSignInLink(page, environment, merchant, "owner", job.slug);
  await page.goto(link);
  await expect(page).toHaveURL(new RegExp(`claimed=${attached ? "claimed" : "requires_verification"}`));
  const completed = await page.request.post("/api/workspaces/claim", { data: body });
  expect(completed.status()).toBe(attached ? 200 : 409);
  if (attached) {
    expect((await completed.json()).workspaceSlug).toBe(merchant.slug);
    expect((await page.request.post("/api/workspaces/claim", { data: body })).status()).toBe(200);
    expect(sql(environment.db, `select count(*) from scan_snapshots where job_id='${job.id}';`)).toBe("1");
    expect(sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and role='owner' and accepted_at is not null;`)).toBe("1");
  } else {
    expect((await completed.json()).error).toBe("not_attached");
    expect(sql(environment.db, `select count(*) from audit_jobs where id='${job.id}' and workspace_id is null;`)).toBe("1");
    expect(sql(environment.db, `select count(*) from scan_snapshots where job_id='${job.id}';`)).toBe("0");
  }
});

test("verified viewer cannot finalize an assigned owner's claim", async ({ page, merchant, environment }) => {
  const job = report(environment, merchant, "hk", true);
  await signIn(page, environment, merchant, "viewer");
  const denied = await page.request.post("/api/workspaces/claim", { data: { claim_slug: job.slug, workspace_name: "Spoofed owner", primary_location: { name: "Other" }, market: "hk", locale: "en" } });
  expect(denied.status()).toBe(403);
  expect(sql(environment.db, `select business_name from workspaces where id='${merchant.workspaceId}';`)).toBe("Acceptance HK");
});

test("TW workspace switched to Hong Kong locale retains TWD and LINE contact behavior", async ({ page, environment }) => {
  const merchant = await seedMerchant(environment, "tw");
  const job = report(environment, merchant, "tw", true);
  await signIn(page, environment, merchant);
  await page.goto(`/zh-HK/owner/${merchant.slug}/settings/plan`);
  await expect(page.locator("body")).toContainText(/TWD|NT\$/);
  await page.goto(`/zh-HK/unlock/${job.slug}?market=tw`);
  await expect(page.getByText("LINE", { exact: true }).first()).toBeVisible();
  const payload = { slug: job.slug, market: "tw", locale: "zh-HK", objective: "understand_performance", preferred_contact_channel: "line", contact_identifier: "acceptance_tw", recovery_email: merchant.emails.owner, report_delivery: true, scan_discussion: false, marketing: false, idempotency_key: randomBytes(32).toString("base64url") };
  const unlocked = await page.request.post("/api/report-access/unlock", { data: payload });
  expect(unlocked.status()).toBe(200);
  expect((await page.request.post("/api/report-access/unlock", { data: payload })).status()).toBe(200);
  expect(sql(environment.db, `select market from workspaces where id='${merchant.workspaceId}';`)).toBe("tw");
  expect(sql(environment.db, `select count(*) from leads where job_id='${job.id}' and preferred_contact_channel='line' and contact_identifier='acceptance_tw';`)).toBe("1");
  const wrongMarketChannel = await page.request.post("/api/report-access/unlock", { data: { ...payload, preferred_contact_channel: "whatsapp", contact_identifier: "+85255555555", idempotency_key: randomBytes(32).toString("base64url") } });
  expect(wrongMarketChannel.status()).toBe(400);
});
