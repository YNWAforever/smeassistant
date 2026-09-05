import { randomUUID } from "node:crypto";
import { test, expect, signIn, requestSignInLink } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";
for (const role of ["viewer", "manager"] as const) test(`${role}: accepted evidence reads, omitted/spoofed context denial, revocation`, async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant, role);
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await expect(page.locator(".action-detail-page")).toBeVisible();
  for (const context of [{ workspaceId: merchant.workspaceId, actionId: merchant.actionId }, { workspaceId: merchant.workspaceId }, { workspaceId: merchant.workspaceId, actionId: merchant.actionId, locationId: merchant.otherLocationId }]) {
    const draft = await page.request.post("/api/assistant/run", { data: { mode: "live", intentId: "draft_review_reply", surface: "action", locale: "en", context } });
    expect(draft.status()).toBe(403);
  }
  expect((await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } })).status()).toBe(403);
  const version = randomUUID();
  sql(environment.db, `insert into output_versions(id,workspace_id,action_id,version_no,body,author_type,approval_state) values ('${version}','${merchant.workspaceId}','${merchant.actionId}',1,'Fixture version','user','approved');`);
  expect((await page.request.post(`/api/versions/${version}/approve`, { data: {} })).status()).toBe(403);
  expect((await page.request.post(`/api/versions/${version}/export`, { data: { mode: "copy", idempotency_key: randomUUID() } })).status()).toBe(403);
  expect(sql(environment.db, `select count(*) from action_runs where action_id='${merchant.actionId}';`)).toBe("0");
  const accepted = sql(environment.db, `select accepted_at from workspace_members where workspace_id='${merchant.workspaceId}' and role='${role}';`);
  expect(accepted).not.toBe("");
  await page.goto(`/en/owner/${merchant.slug}`);
  expect(sql(environment.db, `select accepted_at from workspace_members where workspace_id='${merchant.workspaceId}' and role='${role}';`)).toBe(accepted);
  sql(environment.db, `delete from workspace_members where workspace_id='${merchant.workspaceId}' and role='${role}';`);
  const revoked = await page.request.post("/api/assistant/run", { data: { mode: "live", intentId: "explain_limits", surface: "workspace", locale: "en", context: { workspaceId: merchant.workspaceId } } });
  expect(revoked.status()).toBe(403);
});

test("unverified identity and invalid callback cannot acquire workspace authority", async ({ page, merchant, environment }) => {
  expect(sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and accepted_at is not null;`)).toBe("0");
  expect((await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: {} })).status()).toBe(401);
  await page.goto("/auth/callback?code=invalid-fixture-code&locale=en");
  await expect(page).toHaveURL(/owner\/sign-in\?error=invalid_code/);
  expect(sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and accepted_at is not null;`)).toBe("0");
});

test("lite permits three distinct approved deliveries and blocks the fourth", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  let base: string | undefined;
  for (let i = 1; i <= 4; i++) {
    const created = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: `Delivery ${i}`, base_version_id: base } });
    expect(created.status()).toBe(201); base = (await created.json()).versionId;
    expect((await page.request.post(`/api/versions/${base}/approve`, { data: {} })).status()).toBe(200);
    const exported = await page.request.post(`/api/versions/${base}/export`, { data: { mode: "copy", idempotency_key: randomUUID() } });
    expect(exported.status()).toBe(i <= 3 ? 200 : 409);
    if (i === 4) expect((await exported.json()).error).toBe("allowance_exceeded");
  }
  expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("3");
});


 test("expired real Auth link cannot accept an invitation", async ({ page, merchant, environment }) => {
  const link = await requestSignInLink(page, environment, merchant);
  sql(environment.db, `update auth.users set confirmation_sent_at=now()-interval '2 hours', recovery_sent_at=now()-interval '2 hours' where email='${merchant.emails.owner}';`);
  await page.goto(link);
  await expect(page).toHaveURL(/error=/);
  expect(sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and accepted_at is not null;`)).toBe("0");
 });
