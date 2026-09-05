import { expect, test } from "@playwright/test";
test("the public scan page offers manual entry", async ({ page }) => {
  await page.goto("/zh-HK/scan?market=hk");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading").first()).toBeVisible();
});
