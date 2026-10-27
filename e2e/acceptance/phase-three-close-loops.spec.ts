import { randomUUID } from "node:crypto";
import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

for (const answer of ["貼咗", "未貼", "遲啲"] as const) {
  test(`copy → one Today question → ${answer} persists against the copied version`, async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant);
    const base = `/zh-HK/owner/${merchant.slug}`;
    const saved = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: "Approved synthetic reply, no real posting", base_version_id: null } });
    expect(saved.status()).toBe(201);
    const versionId = (await saved.json()).versionId as string;
    expect((await page.request.post(`/api/versions/${versionId}/approve`, { data: {} })).status()).toBe(200);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`${base}/actions/${merchant.actionId}?version=${versionId}&location=primary`);
    const recorded = page.waitForResponse(response => response.url().endsWith(`/api/actions/${merchant.actionId}/copy-follow-up`) && response.request().method() === "POST");
    await page.locator(".approval-panel").getByRole("button", { name: "複製", exact: true }).click();
    expect((await recorded).status()).toBe(200);
    expect(sql(environment.db, `select count(*) from action_applications where action_id='${merchant.actionId}';`)).toBe("0");
    const newer = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: "A separate draft still waiting", base_version_id: versionId } });
    expect(newer.status()).toBe(201);
    await page.goto(`${base}?location=other`);
    await expect(page.getByTestId("home-copy-followup")).toHaveCount(0);
    await page.goto(`${base}?location=primary`);
    const card = page.getByTestId("home-copy-followup");
    await expect(page.locator(".owner-brief-grid .brief-priority-card")).toHaveCount(1);
    await expect(card.getByRole("heading", { name: "你貼咗未？" })).toBeVisible();
    await expect(card).not.toContainText(/已套用|獨立核實|分數/);
    await card.getByRole("button", { name: answer, exact: true }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(card).toHaveCount(0);
    expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("1");
    if (answer === "貼咗") {
      expect(sql(environment.db, `select action_state from actions where id='${merchant.actionId}';`)).toBe("in_progress");
      await page.goto(`${base}/actions?location=primary`);
      await expect(page.locator(".action-card").filter({ hasText: "回覆評論" })).toHaveCount(1);
      await page.goto(`${base}?location=primary`);
      expect(sql(environment.db, `select output_version_id from action_applications where action_id='${merchant.actionId}' and source='owner_asserted' and retracted_at is null;`)).toBe(versionId);
      expect(sql(environment.db, `select count(*) from action_applications where action_id='${merchant.actionId}' and source='verified';`)).toBe("0");
      expect((await page.request.delete(`/api/actions/${merchant.actionId}/applied`)).status()).toBe(200);
      await page.reload();
      await expect(card).toHaveCount(0);
    } else {
      expect(sql(environment.db, `select payload->>'decision' from audit_events where entity_id='${merchant.actionId}' and event='action.copy_follow_up_recorded' order by id desc limit 1;`)).toBe(answer === "未貼" ? "not_yet" : "later");
      expect(sql(environment.db, `select count(*) from action_applications where action_id='${merchant.actionId}';`)).toBe("0");
      // A repeat copy is idempotent at this reminder boundary and cannot undo the answer.
      expect((await page.request.post(`/api/actions/${merchant.actionId}/copy-follow-up`, { data: { versionId, decision: "pending" } })).status()).toBe(200);
      await page.reload();
      await expect(card).toHaveCount(0);
      if (answer === "遲啲") {
        sql(environment.db, `update audit_events set created_at=now()-interval '25 hours' where entity_id='${merchant.actionId}' and event='action.copy_follow_up_recorded';`);
        await page.reload();
        await expect(card).toBeVisible();
        await card.getByRole("button", { name: "未貼", exact: true }).click();
        await expect(card).toHaveCount(0);
      }
    }
  });
}

test("a refused clipboard copy creates no Today reminder", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  const saved = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: "Synthetic clipboard failure", base_version_id: null } });
  const versionId = (await saved.json()).versionId as string;
  expect((await page.request.post(`/api/versions/${versionId}/approve`, { data: {} })).status()).toBe(200);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("fixture clipboard refused"); } } });
    document.execCommand = () => false;
  });
  await page.goto(`/zh-HK/owner/${merchant.slug}/actions/${merchant.actionId}`);
  const exported = page.waitForResponse(response => response.url().endsWith(`/api/versions/${versionId}/export`));
  await page.locator(".approval-panel").getByRole("button", { name: "複製", exact: true }).click();
  expect((await exported).status()).toBe(200);
  await expect(page.getByText("無法存取剪貼簿；請手動複製。")).toBeVisible();
  expect(sql(environment.db, `select count(*) from audit_events where entity_id='${merchant.actionId}' and event='action.copy_follow_up_recorded';`)).toBe("0");
  await page.goto(`/zh-HK/owner/${merchant.slug}`);
  await expect(page.getByTestId("home-copy-followup")).toHaveCount(0);
});

test("inline facts stay on Edit for a saved draft and persist before generation", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  const saved = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: "Draft waiting for facts", base_version_id: null } });
  expect(saved.status()).toBe(201);
  sql(environment.db, `update actions set action_state='needs_input',required_inputs='["brand_voice","approved_claim","opening_hours","asset_or_text_only"]',provided_inputs='{}' where id='${merchant.actionId}';`);
  await page.goto(`/zh-HK/owner/${merchant.slug}/actions/${merchant.actionId}`);
  for (const [key, value] of [["brand_voice", "warm"], ["approved_claim", "本店每日現做"], ["opening_hours", "每日 10:00–20:00"]]) await page.locator(`#input-${key}`).fill(value);
  await page.locator("#input-asset_or_text_only").click();
  await page.getByRole("option", { name: "純文字（不使用相片）" }).click();
  await expect(page.locator('.owner-steps [aria-current="step"]')).toContainText("改稿");
  const patched = page.waitForResponse(response => response.url().endsWith(`/api/actions/${merchant.actionId}`) && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "儲存資料並重新生成", exact: true }).click();
  expect((await patched).status()).toBe(200);
  expect(sql(environment.db, `select provided_inputs->>'opening_hours' from actions where id='${merchant.actionId}';`)).toBe("每日 10:00–20:00");
  expect(sql(environment.db, `select provided_inputs->>'text_only' from actions where id='${merchant.actionId}';`)).toBe("true");
  await expect(page).toHaveURL(new RegExp(`/actions/${merchant.actionId}`));
});

test("viewer keeps the four-tab pages and sees Ask owner primaries; generation stays out of shared assistant", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant, "viewer");
  const base = `/zh-HK/owner/${merchant.slug}`;
  await page.goto(`${base}/actions/${merchant.actionId}`);
  await expect(page.locator(".action-detail-header [role=combobox]")).toHaveCount(0);
  await expect(page.locator(".role-notice")).toHaveText("你睇到，改要問店主。");
  await expect(page.getByRole("button", { name: "問店主改", exact: true }).first()).toBeDisabled();
  for (const route of ["/actions", "/actions/new", "/business/assets", "/business/profile"]) {
    await page.goto(`${base}${route}`);
    await expect(page.locator(".mobile-bottom-nav a")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "問店主改", exact: true }).first()).toBeDisabled();
  }
  for (const surface of ["home", "actions", "insights"]) {
    for (const intentId of ["draft_review_reply", "friendlier_review_reply", "generate_social", "generate_faq", "generate_menu"]) {
      const response = await page.request.post("/api/assistant/run", { data: { mode: "live", surface, intentId, locale: "zh-HK", context: { workspaceId: merchant.workspaceId, actionId: merchant.actionId } } });
      expect(response.status()).toBe(400);
    }
  }
  const denied = await page.request.post(`/api/actions/${merchant.actionId}/copy-follow-up`, { data: { versionId: randomUUID(), decision: "pending" } });
  expect(denied.status()).toBe(403);
});

test("rescan controls only appear beside their copy for a paid permitted branch", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  const base = `/zh-HK/owner/${merchant.slug}`;
  for (const route of ["", "/insights"]) {
    await page.goto(`${base}${route}?location=primary`);
    await expect(page.getByRole("button", { name: "重新掃描", exact: true })).toHaveCount(0);
  }
  const scanId = randomUUID();
  sql(environment.db, `insert into audit_jobs(id,share_slug,business_name,region,status,workspace_id,location_id,completed_at) values('${scanId}','phase3-${scanId}','Synthetic shop','hk','done','${merchant.workspaceId}','${merchant.locationId}',now());
    insert into scan_snapshots(job_id,workspace_id,location_id,market,observed_at,coverage,module_states,metrics) values('${scanId}','${merchant.workspaceId}','${merchant.locationId}','hk',now(),0,'{}','{}');
    update workspaces set tier='paid' where id='${merchant.workspaceId}';`);
  for (const route of ["", "/insights"]) {
    await page.goto(`${base}${route}?location=primary`);
    const tools = page.locator(".owner-results-tools");
    await expect(tools).toContainText("想再睇一次舖頭？");
    await expect(tools.getByRole("button", { name: "重新掃描", exact: true })).toBeVisible();
    await page.goto(`${base}${route}?location=all`);
    await expect(page.getByRole("button", { name: "重新掃描", exact: true })).toHaveCount(0);
  }
});

test("Today offers one draft recovery, while reference and error details stay under Why", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  sql(environment.db, `insert into action_runs(workspace_id,action_id,agent_key,state,error,finished_at) values('${merchant.workspaceId}','${merchant.actionId}','review_reply','failed','invalid_output',now());`);
  await page.goto(`/zh-HK/owner/${merchant.slug}`);
  const problem = page.locator("[data-problem]");
  await expect(problem).toHaveCount(1);
  await expect(problem.getByRole("link", { name: "再開張稿", exact: true })).toBeVisible();
  await expect(problem.locator("details")).not.toHaveAttribute("open");
  await expect(problem.locator("small")).toBeHidden();
  await expect(problem.locator('a[href*="settings/activity"]')).toHaveCount(0);
  await problem.locator("summary").click();
  await expect(problem.locator("small")).toContainText(/RUN-/);
});
