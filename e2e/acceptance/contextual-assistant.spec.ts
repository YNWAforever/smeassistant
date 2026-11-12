import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

// The assistant never approves, exports or publishes; none of these routes may be called while the owner asks and follows the link.
const AUTHORITY_ROUTE = /\/api\/versions\/[^/]+\/(approve|request-changes|reject|export)|\/api\/(.*\/)?publish/;

test("an owner with a waiting draft gets a Kinnso deep-link to the exact version", async ({ page, merchant, environment }) => {
  const db = environment.db;
  const ws = merchant.workspaceId;
  const usage = () => sql(db, `select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${ws}';`);

  await signIn(page, environment, merchant);

  // 1. On the action, generate a draft with the fixture model so one `draft` version exists.
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await expect(page.locator(".action-detail-page")).toBeVisible();
  const generate = page.getByRole("button", { name: /Generate a draft|Regenerate/ });
  await expect(generate).toHaveCount(1);
  await generate.click();
  await page.getByRole("tab", { name: "History" }).click();
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

  // Record every request from here on: the Kinnso handoff must never reach an approve, export or publish route.
  const requested: string[] = [];
  page.on("request", (request) => { requested.push(`${request.method()} ${new URL(request.url()).pathname}`); });

  // 2. Today no longer opens an assistant sheet. The ask entry is a Kinnso
  // deep-link (href only: CI acceptance does not enable the conversation surface).
  await page.goto(`/en/owner/${merchant.slug}`);
  await expect(page.locator("details.owner-priority-evidence")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask why this comes first" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const ask = page.locator(".home-v2-ask");
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("link").first()).toHaveAttribute("href", new RegExp(`/en/owner/${merchant.slug}/conversation`));

  // 3–4. On the action, the revise control is an Ask Kinnso link that carries
  // the exact waiting version (ask=revise_action). Do not follow it here.
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}?version=${versionId}`);
  await expect(page.locator(".action-detail-page")).toBeVisible();
  const link = page.getByRole("link", { name: "Revise with operator as a new version" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toContain(`/conversation?`);
  expect(href).toContain(`action=${merchant.actionId}`);
  expect(href).toContain(`version=${versionId}`);
  expect(href).toContain("ask=revise_action");
  await page.getByRole("tab", { name: "History" }).click();
  // A waiting version is always its action's newest (create_output_version supersedes earlier draft/changes_requested rows), so this does not isolate ?version=; components/workspace/action-detail-version-param.test.tsx does.
  await expect(page.locator(".version-list button[aria-pressed='true']")).toContainText("Version 1");

  // Continuing opens saved text for confirmation; re-editing keeps one clear
  // Regenerate control without creating another version or calling the model.
  await page.getByRole("tab", { name: "Write & confirm" }).click();
  await expect(page.locator("#draft-content")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Change the draft", exact: true }).click();
  await expect(page.locator("#draft-content")).not.toHaveAttribute("readonly");
  const regenerate = page.getByRole("button", { name: /^Regenerate/ });
  await expect(regenerate).toHaveCount(1);
  await expect(regenerate).toBeEnabled();

  // Visiting Today and reading the Kinnso link changed nothing and called no authority route.
  expect(requested.filter((entry) => AUTHORITY_ROUTE.test(entry))).toEqual([]);
  expect(requested.filter((entry) => entry === "POST /api/assistant/run")).toEqual([]);
  expect(sql(db, `select count(*) from output_versions where workspace_id='${ws}';`)).toBe(before.versions);
  expect(sql(db, `select count(*) from deliveries where workspace_id='${ws}';`)).toBe(before.deliveries);
  expect(sql(db, `select count(*) from action_runs where workspace_id='${ws}';`)).toBe(before.runs);
  expect(sql(db, `select approval_state from output_versions where id='${versionId}';`)).toBe(before.state);
  expect(usage()).toBe("0");
});
