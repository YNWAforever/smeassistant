import type { Locator } from "@playwright/test";
import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

/** The workspace is seeded in Asia/Hong_Kong, so "today" is that calendar day, not the runner's UTC day. */
function hongKongDate(offsetDays: number): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

/** A click made before the page hydrates is dropped, so repeat it until the thing it should open is there. */
async function clickUntil(target: Locator, opened: Locator) {
  await expect(async () => {
    await target.click({ timeout: 3000 });
    await expect(opened).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60000 });
}

// zh-HK strings, from lib/copy-workspace.ts (offers) and components/workspace/action-detail-client.tsx.
const OFFER_CHANGED = "優惠在這份草稿撰寫後已更改。請按目前的優惠重新生成草稿。";

test("an offer becomes two drafts, one is approved and exported, and an edited offer refuses the stale draft", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  const used = () => sql(environment.db, `select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${merchant.workspaceId}';`);
  expect(used()).toBe("0");

  // 1. Create an offer (HKD 1280, today through today + 14) and confirm it.
  await page.goto(`/zh-HK/owner/${merchant.slug}/offers`);
  await clickUntil(page.getByRole("button", { name: "新增優惠" }), page.locator("#offer-title"));
  await page.locator("#offer-location").selectOption({ label: "Primary" });
  await page.locator("#offer-title").fill("Autumn tasting set");
  await page.locator("#offer-details").fill("A seasonal tasting set for two.");
  await page.locator("#offer-terms").fill("Dine-in only.");
  await page.locator("#offer-price").fill("1280");
  await expect(page.locator("#offer-currency")).toHaveValue("HKD");
  await page.locator("#offer-valid-from").fill(hongKongDate(0));
  await page.locator("#offer-valid-until").fill(hongKongDate(14));
  await page.getByRole("button", { name: "儲存優惠" }).click();
  const card = page.locator(".offer-card", { hasText: "Autumn tasting set" });
  await expect(card).toBeVisible();
  await expect(card.getByText("草稿", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "確認", exact: true }).click();
  await expect(card.getByText("這些資料正確，並可用於草稿。")).toBeVisible();
  await card.getByRole("button", { name: "確認這些資料" }).click();
  await expect(card.getByText("已確認", { exact: true })).toBeVisible();
  expect(sql(environment.db, `select status || ':' || price_amount || ':' || currency from offers where workspace_id='${merchant.workspaceId}';`)).toBe("confirmed:1280.00:HKD");

  // 2. "Create promotion drafts": the delivery disclosure is visible before anything runs, then both drafts reach "draft ready".
  await card.getByRole("button", { name: "建立推廣草稿" }).click();
  await expect(card.getByText("會建立 2 份草稿（Instagram、Google）")).toBeVisible();
  expect(sql(environment.db, `select count(*) from actions where workspace_id='${merchant.workspaceId}' and template_key like 'offer-%';`)).toBe("0");
  await card.getByRole("button", { name: "建立草稿", exact: true }).click();
  const rows = card.locator(".evidence-list li");
  await expect(rows).toHaveCount(2);
  await expect(card.getByText("草稿已備妥")).toHaveCount(2, { timeout: 90000 });
  const instagram = rows.filter({ hasText: "Instagram" }).getByRole("link", { name: "開啟草稿" });
  const google = rows.filter({ hasText: "Google" }).getByRole("link", { name: "開啟草稿" });
  const instagramHref = (await instagram.getAttribute("href"))!;
  const googleHref = (await google.getAttribute("href"))!;
  expect(instagramHref).not.toBe(googleHref);
  expect(sql(environment.db, `select count(*) from output_versions v join actions a on a.id=v.action_id where a.workspace_id='${merchant.workspaceId}' and a.template_key like 'offer-%' and v.approval_state='draft';`)).toBe("2");
  expect(used()).toBe("0");

  // 3. Approve and export the Instagram draft: usage goes up by exactly one.
  await page.goto(instagramHref);
  await expect(page.getByRole("button", { name: "核准第 1 版" }).first()).toBeEnabled();
  await clickUntil(page.getByRole("button", { name: "核准第 1 版" }).first(), page.getByRole("dialog"));
  await page.getByRole("dialog").getByRole("button", { name: "核准第 1 版" }).click();
  await expect(page.getByRole("button", { name: /匯出已核准版本/ }).first()).toBeEnabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /匯出已核准版本/ }).first().click();
  expect((await download).suggestedFilename()).toMatch(/-v1\.md$/);
  await expect.poll(used).toBe("1");

  // 4. Change the price to 1180 (back to a draft), then confirm it again.
  await page.goto(`/zh-HK/owner/${merchant.slug}/offers`);
  const again = page.locator(".offer-card", { hasText: "Autumn tasting set" });
  await clickUntil(again.getByRole("button", { name: "編輯" }), page.locator("#offer-price"));
  await page.locator("#offer-price").fill("1180");
  await page.getByRole("button", { name: "儲存修改" }).click();
  await expect(again.getByText("草稿", { exact: true })).toBeVisible();
  expect(sql(environment.db, `select status || ':' || price_amount from offers where workspace_id='${merchant.workspaceId}';`)).toBe("draft:1180.00");
  await again.getByRole("button", { name: "確認", exact: true }).click();
  await again.getByRole("button", { name: "確認這些資料" }).click();
  await expect(again.getByText("已確認", { exact: true })).toBeVisible();
  expect(sql(environment.db, `select status || ':' || price_amount from offers where workspace_id='${merchant.workspaceId}';`)).toBe("confirmed:1180.00");

  // 5. The Google draft was written from the old revision: approving it answers 409 offer_changed, shows the owner copy, and stays a draft.
  await page.goto(googleHref);
  await expect(page.getByTestId("offer-stale-banner")).toContainText(OFFER_CHANGED);
  const refusal = page.waitForResponse((response) => /\/api\/versions\/[^/]+\/approve/.test(response.url()));
  await clickUntil(page.getByRole("button", { name: "核准第 1 版" }).first(), page.getByRole("dialog"));
  await page.getByRole("dialog").getByRole("button", { name: "核准第 1 版" }).click();
  const response = await refusal;
  expect(response.status()).toBe(409);
  expect((await response.json() as { error: string }).error).toBe("offer_changed");
  await expect(page.getByTestId("offer-stale-banner")).toContainText(OFFER_CHANGED);
  await expect(page.locator("body")).not.toContainText("offer_changed");
  expect(sql(environment.db, `select v.approval_state from output_versions v join actions a on a.id=v.action_id where a.workspace_id='${merchant.workspaceId}' and a.template_key='offer-google-post';`)).toBe("draft");
  expect(used()).toBe("1");
});
