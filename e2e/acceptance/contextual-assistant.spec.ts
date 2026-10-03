import type { Locator } from "@playwright/test";
import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

/** A click made before the page hydrates is dropped, so repeat it until the thing it should open is there. Only for controls that open things. */
async function clickUntil(target: Locator, opened: Locator) {
  await expect(async () => {
    await target.click({ timeout: 3000 });
    await expect(opened).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60000 });
}

// The assistant never approves, exports or publishes; none of these routes may be called while the owner asks and follows the link.
const AUTHORITY_ROUTE = /\/api\/versions\/[^/]+\/(approve|request-changes|reject|export)|\/api\/(.*\/)?publish/;

test("an owner with a waiting draft continues from the assistant to the exact version", async ({ page, merchant, environment }) => {
  const db = environment.db;
  const ws = merchant.workspaceId;
  const usage = () => sql(db, `select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${ws}';`);

  await signIn(page, environment, merchant);

  // 1. On the action, generate a draft with the fixture model so one `draft` version exists.
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await expect(page.locator(".action-detail-page")).toBeVisible();
  await page.getByRole("button", { name: /Generate a draft|Regenerate/ }).click();
  await page.getByRole("tab", { name: "Version & audit history" }).click();
  await expect(page.locator(".version-list button")).toHaveCount(1, { timeout: 90000 });
  const versionId = sql(db, `select id from output_versions where action_id='${merchant.actionId}' and version_no=1 and approval_state='draft';`);
  expect(versionId).toMatch(/^[a-f0-9-]{36}$/);
  const before = {
    versions: sql(db, `select count(*) from output_versions where workspace_id='${ws}';`),
    deliveries: sql(db, `select count(*) from deliveries where workspace_id='${ws}';`),
    runs: sql(db, `select count(*) from action_runs where workspace_id='${ws}';`),
    state: sql(db, `select approval_state from output_versions where id='${versionId}';`),
  };
  expect(usage()).toBe("0");

  // Record every request from here on: the sheet steps must never reach an approve, export or publish route.
  const requested: string[] = [];
  page.on("request", (request) => { requested.push(`${request.method()} ${new URL(request.url()).pathname}`); });

  // 2. Home: open the sheet from "Ask why this comes first".
  await page.goto(`/en/owner/${merchant.slug}`);
  const suggestionsResponse = page.waitForResponse((response) => response.url().includes("/api/assistant/suggestions") && response.status() === 200);
  await clickUntil(page.getByRole("button", { name: "Ask why this comes first" }), page.getByRole("dialog"));
  await suggestionsResponse;

  // 3. "Needs you now" and "Where do I continue?" are offered; ask it.
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Needs you now", { exact: true })).toBeVisible();
  const askButton = sheet.getByRole("button", { name: "Where do I continue?" });
  await expect(askButton).toBeVisible();
  const run = page.waitForResponse((response) => response.url().includes("/api/assistant/run") && response.request().method() === "POST");
  await askButton.click();
  const runResponse = await run;
  expect(runResponse.status()).toBe(200);
  expect(runResponse.request().postDataJSON()).toMatchObject({ origin: "suggested" });

  // 4. The answer names v1, and the next step links to that exact version.
  await expect(sheet.locator(".assistant-answer-card")).toContainText("v1");
  const link = sheet.getByRole("link", { name: "Continue here" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toContain(`/actions/${merchant.actionId}?version=${versionId}`);
  await link.click();

  // 5. The action page opens with that version selected.
  await expect(page).toHaveURL(new RegExp(`/actions/${merchant.actionId}\\?version=${versionId}(&|$)`));
  await expect(page.locator(".action-detail-page")).toBeVisible();
  await page.getByRole("tab", { name: "Version & audit history" }).click();
  // A waiting version is always its action's newest (create_output_version supersedes earlier draft/changes_requested rows), so this does not isolate ?version=; components/workspace/action-detail-version-param.test.tsx does.
  await expect(page.locator(".version-list button[aria-pressed='true']")).toContainText("Version 1");

  // The assistant and the link changed nothing and called no authority route.
  expect(requested.filter((entry) => AUTHORITY_ROUTE.test(entry))).toEqual([]);
  expect(requested.some((entry) => entry === "POST /api/assistant/run")).toBe(true);
  expect(sql(db, `select count(*) from output_versions where workspace_id='${ws}';`)).toBe(before.versions);
  expect(sql(db, `select count(*) from deliveries where workspace_id='${ws}';`)).toBe(before.deliveries);
  expect(sql(db, `select count(*) from action_runs where workspace_id='${ws}';`)).toBe(before.runs);
  expect(sql(db, `select approval_state from output_versions where id='${versionId}';`)).toBe(before.state);
  expect(usage()).toBe("0");
});
