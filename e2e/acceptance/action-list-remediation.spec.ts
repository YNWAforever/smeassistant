import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

test("375px keyboard selection, preview, apply and Escape use the actual scoped action list (T-13 T-17)", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant, "owner");
  await page.setViewportSize({ width: 375, height: 812 });
  const base = `/en/owner/${merchant.slug}/actions`;
  await page.goto(base);
  const search = page.getByRole("searchbox", { name: "Search title and summary" });
  await search.fill("Reply to reviews"); await search.press("Enter");
  await expect(page).toHaveURL(/q=Reply/); await expect(page.locator(".action-card")).toHaveCount(1);
  const checkbox = page.getByRole("checkbox", { name: "Select Reply to reviews" });
  await checkbox.focus(); await checkbox.press("Space"); await expect(checkbox).toBeChecked();
  const trigger = page.getByRole("button", { name: "Assign selected", exact: true });
  await trigger.focus(); await trigger.press("Enter");
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await page.getByLabel("Assignee change").selectOption({ label: merchant.emails.owner });
  await page.getByLabel("Due date change").selectOption("set");
  await page.getByLabel("Due time (Asia/Hong_Kong)").fill("2026-10-12T09:00");
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(dialog.getByText("Eligible after review", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
  await expect(dialog.getByText("1 of 1 completed. Review each result.")).toBeVisible();
  expect(sql(environment.db,`SELECT due_at AT TIME ZONE 'UTC' FROM actions WHERE id='${merchant.actionId}'`)).toBe("2026-10-12 01:00:00");
  expect(sql(environment.db,`SELECT count(*) FROM audit_events WHERE entity_id='${merchant.actionId}' AND event='action.updated'`)).toBe("1");
  await page.keyboard.press("Escape");
  await expect(page.locator(".action-card-meta")).toContainText(merchant.emails.owner);
  await expect(page.locator(".action-card-meta")).toContainText("12 Oct 2026, 09:00");
  const assigneeId = sql(environment.db, `SELECT assignee_user_id FROM actions WHERE id='${merchant.actionId}'`);
  expect(sql(environment.db, `SELECT email FROM workspace_members WHERE workspace_id='${merchant.workspaceId}' AND user_id='${assigneeId}' AND accepted_at IS NOT NULL`)).toBe(merchant.emails.owner);
  await page.goto(`${base}?assignee=${assigneeId}`);
  await expect(page.locator(".action-card")).toHaveCount(1);
  await expect(page.locator(".action-card-meta")).toContainText(merchant.emails.owner);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("viewer has search and evidence but no bulk selection; manager retains location scope (T-13)", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant,"viewer"); await page.goto(`/en/owner/${merchant.slug}/actions`);
  await expect(page.getByRole("searchbox")).toBeVisible(); await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect((await page.request.post(`/api/workspaces/${merchant.workspaceId}/actions/bulk`,{data:{mode:"preview",items:[{actionId:merchant.actionId,expectedUpdatedAt:"2026-10-01T00:00:00Z"}],patch:{due_at:null}}})).status()).toBe(403);
  await signIn(page,environment,merchant,"manager"); await page.goto(`/en/owner/${merchant.slug}/actions?location=all`);
  await expect(page.locator(".action-card")).toHaveCount(0); await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("lost apply response is re-read before retry and never duplicates the stored update (T-13 T-15)", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant, "owner");
  await page.goto(`/en/owner/${merchant.slug}/actions`);
  await page.getByRole("checkbox", { name: "Select Reply to reviews" }).check();
  await page.getByRole("button", { name: "Assign selected", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await page.getByLabel("Due date change").selectOption("set");
  await page.getByLabel("Due time (Asia/Hong_Kong)").fill("2026-10-12T09:00");
  let lostResponse = false, storedResponseStatus: number | undefined;
  await page.route(`**/api/workspaces/${merchant.workspaceId}/actions/bulk`, async route => {
    if (!lostResponse && route.request().postDataJSON().mode === "apply") {
      lostResponse = true;
      const response = await route.fetch(); // The real server commits; only the browser's response is lost.
      storedResponseStatus = response.status();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm changes", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("The result is unknown");
  expect(storedResponseStatus).toBe(200);
  await expect(dialog.getByText("0 of 1 completed. Review each result.")).toBeVisible();
  await page.getByRole("button", { name: "Read again and preview failed items", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm changes", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
  await expect(dialog.getByText("1 of 1 completed. Review each result.")).toBeVisible();
  await expect(dialog.getByText("Already set; no change", { exact: true })).toBeVisible();
  expect(sql(environment.db, `SELECT count(*) FROM audit_events WHERE entity_id='${merchant.actionId}' AND event='action.updated'`)).toBe("1");
  expect(sql(environment.db, `SELECT due_at AT TIME ZONE 'UTC' FROM actions WHERE id='${merchant.actionId}'`)).toBe("2026-10-12 01:00:00");
});
