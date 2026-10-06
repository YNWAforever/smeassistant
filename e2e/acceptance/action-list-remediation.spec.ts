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
  await trigger.press("Enter"); await page.getByLabel("Due date change").selectOption("set");
  await page.getByLabel("Due time (Asia/Hong_Kong)").fill("2026-10-12T09:00");
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(dialog.getByText("Eligible after review", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
  await expect(dialog.getByText("1 of 1 completed. Review each result.")).toBeVisible();
  expect(sql(environment.db,`SELECT due_at AT TIME ZONE 'UTC' FROM actions WHERE id='${merchant.actionId}'`)).toBe("2026-10-12 01:00:00");
  expect(sql(environment.db,`SELECT count(*) FROM audit_events WHERE entity_id='${merchant.actionId}' AND event='action.updated'`)).toBe("1");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("viewer has search and evidence but no bulk selection; manager retains location scope (T-13)", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant,"viewer"); await page.goto(`/en/owner/${merchant.slug}/actions`);
  await expect(page.getByRole("searchbox")).toBeVisible(); await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect((await page.request.post(`/api/workspaces/${merchant.workspaceId}/actions/bulk`,{data:{mode:"preview",items:[{actionId:merchant.actionId,expectedUpdatedAt:"2026-10-01T00:00:00Z"}],patch:{due_at:null}}})).status()).toBe(403);
  await signIn(page,environment,merchant,"manager"); await page.goto(`/en/owner/${merchant.slug}/actions?location=all`);
  await expect(page.locator(".action-card")).toHaveCount(0); await expect(page.getByRole("checkbox")).toHaveCount(0);
});
