import { randomBytes, randomUUID } from "node:crypto";
import { test, expect, requestSignInLink, signIn } from "../../test/e2e/fixtures";
import { sql, type AcceptanceEnvironment } from "../../test/e2e/environment";
import { seedMerchant, type MerchantSeed } from "../../test/e2e/seed";

function report(env: AcceptanceEnvironment, merchant: MerchantSeed, market: "hk" | "tw", attached: boolean) {
  const id = randomUUID(), slug = `claim-${id.slice(0, 12)}`;
  sql(env.db, `insert into audit_jobs(id,share_slug,business_name,region,status,workspace_id,location_id,overall_score,score_coverage,module_results,completed_at) values ('${id}','${slug}','Acceptance business','${market}','done',${attached ? `'${merchant.workspaceId}'` : "null"},${attached ? `'${merchant.locationId}'` : "null"},62,78,'{"ig":{"status":"unavailable","score":null},"gbp":{"status":"measured","score":70}}',now()); insert into leads(job_id,email) values ('${id}','${merchant.emails.owner}');`);
  return { id, slug };
}

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
  await page.goto(`/zh-HK/owner/${merchant.slug}/settings/billing`);
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
