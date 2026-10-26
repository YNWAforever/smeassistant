import { randomUUID } from "node:crypto";
import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

/**
 * Phase 4/5 flows against the real routes: the Actions side panel, bulk
 * approve with read-before-approve, Today reading the approved version back, and a hard 404 for an action that is not there.
 */

function seedDraft(db: string, workspaceId: string, actionId: string): string {
  const version = randomUUID();
  sql(db, `insert into output_versions(id,workspace_id,action_id,version_no,body,author_type,approval_state) values ('${version}','${workspaceId}','${actionId}',1,'Thank you for visiting; we have passed your note to the kitchen.','user','draft');`);
  return version;
}

test("owner reads and bulk-approves a review reply, and Today advances the first draft from review to copy", async ({ page, merchant, environment }) => {
  const version = seedDraft(environment.db, merchant.workspaceId, merchant.actionId);
  await signIn(page, environment, merchant, "owner");

  const faces = [
    { locale: "en", review: "Review draft", copy: "Copy text" },
    { locale: "zh-HK", review: "審閱草稿", copy: "複製文字" },
  ] as const;
  expect(sql(environment.db, `select count(*) from output_versions where workspace_id='${merchant.workspaceId}' and approval_state='approved';`)).toBe("0");
  for (const face of faces) {
    await page.goto(`/${face.locale}/owner/${merchant.slug}?location=primary`);
    const review = page.locator(".brief-priority-card").getByRole("link", { name: face.review, exact: true });
    await expect(review).toBeVisible();
    await expect(review).toHaveAttribute("href", `/${face.locale}/owner/${merchant.slug}/actions/${merchant.actionId}?version=${version}&location=primary`);
    await expect(page.locator(".getting-started")).toHaveCount(0);
  }

  await page.goto(`/en/owner/${merchant.slug}/actions`);
  const bulk = page.locator(".bulk-approve");
  await expect(bulk.getByRole("heading", { level: 2 })).toHaveText("1 drafts ready to approve");
  await bulk.getByRole("button", { name: "Review and approve" }).click();

  const dialog = page.getByRole("dialog", { name: "Approve drafts" });
  await expect(dialog.locator("blockquote")).toContainText("passed your note to the kitchen");
  // Nothing can be approved before the draft is marked as read.
  await expect(dialog.getByRole("button", { name: /^Approve \d+ selected$/ })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "I have read this draft" }).check();
  await dialog.getByRole("button", { name: "Approve 1 selected" }).click();
  await expect(dialog.getByRole("status")).toHaveText("1 of 1 approved");
  expect(sql(environment.db, `select approval_state from output_versions where id='${version}';`)).toBe("approved");
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(page.locator(".bulk-approve")).toHaveCount(0);

  // Today's visible next step reflects the first approval, rather than a
  // completed setup tick that Phase 1 deliberately removed from task-bearing homes.
  for (const face of faces) {
    await page.goto(`/${face.locale}/owner/${merchant.slug}?location=primary`);
    const coach = page.locator(".brief-priority-card");
    const copy = coach.getByRole("link", { name: face.copy, exact: true });
    await expect(copy).toBeVisible();
    await expect(copy).toHaveAttribute("href", `/${face.locale}/owner/${merchant.slug}/actions/${merchant.actionId}?version=${version}&location=primary`);
    await expect(coach.getByRole("link", { name: face.review, exact: true })).toHaveCount(0);
    await expect(page.locator(".getting-started")).toHaveCount(0);
  }
});

test("a viewer is offered no bulk approval and the approve route refuses them", async ({ page, merchant, environment }) => {
  const version = seedDraft(environment.db, merchant.workspaceId, merchant.actionId);
  await signIn(page, environment, merchant, "viewer");
  await page.goto(`/en/owner/${merchant.slug}/actions`);
  await expect(page.getByRole("heading", { level: 1, name: "Actions" })).toBeVisible();
  await expect(page.locator(".bulk-approve")).toHaveCount(0);
  expect((await page.request.post(`/api/versions/${version}/approve`, { data: {} })).status()).toBe(403);
  expect(sql(environment.db, `select approval_state from output_versions where id='${version}';`)).toBe("draft");
});

test("the side panel opens beside the queue and closing it keeps the queue's filters", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant, "owner");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/en/owner/${merchant.slug}/actions?location=primary`);
  await page.getByRole("link", { name: /Preview/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`open=${merchant.actionId}`));
  const panel = page.getByRole("complementary", { name: "Action details" });
  await expect(panel.getByRole("heading", { level: 2, name: "Reply to reviews" })).toBeVisible();
  // The queue keeps the page's only h1; the panel's title is an h2.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(panel.getByRole("link", { name: "Open full page" })).toHaveAttribute("href", new RegExp(`/actions/${merchant.actionId}`));
  await panel.getByRole("tab", { name: "Version & audit history" }).click();
  await expect(panel.getByRole("tabpanel")).toBeVisible();
  await panel.getByRole("link", { name: "Close details" }).click();
  await expect(page).not.toHaveURL(/open=/);
  await expect(page).toHaveURL(/location=primary/);
});

test("an action id that is not in the workspace answers a real 404", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant, "owner");
  for (const id of [randomUUID(), "not-an-id"]) {
    const response = await page.goto(`/en/owner/${merchant.slug}/actions/${id}`);
    expect(response?.status(), id).toBe(404);
  }
  // A bad ?open= only leaves the panel closed.
  const queue = await page.goto(`/en/owner/${merchant.slug}/actions?open=not-an-id`);
  expect(queue?.status()).toBe(200);
});
