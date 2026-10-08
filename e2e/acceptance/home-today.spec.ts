import type { Locator, Page } from "@playwright/test";
import { test, expect, signIn } from "../../test/e2e/fixtures";

/**
 * FA-04: on a 375×812 phone the owner sees today's action and its button
 * without scrolling, and nothing hides it -- not the methodology (now inside
 * the closed 「為何可信」 disclosure) and not the fixed mobile bottom nav.
 */
async function bottom(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.y + box!.height;
}

async function visibleLimit(page: Page): Promise<number> {
  // The fixed bottom nav covers the end of the viewport on mobile.
  const nav = page.locator(".mobile-bottom-nav");
  const navBox = (await nav.count()) ? await nav.first().boundingBox() : null;
  return navBox ? navBox.y : page.viewportSize()!.height;
}

for (const visual of [
  { locale: "en", label: "Do this today", trust: "Why you can trust this" },
  { locale: "zh-HK", label: "今日要做", trust: "為何可信" },
  { locale: "zh-TW", label: "今日要做", trust: "為何可信" },
] as const) {
  test(`owner home shows today's action above the fold at 375px (${visual.locale})`, async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant, "owner");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${visual.locale}/owner/${merchant.slug}`);

    const card = page.locator(".brief-priority-card");
    await expect(card).toContainText(visual.label);
    const title = card.locator("h2");
    const button = card.locator(".brief-priority-actions a");
    await expect(title).toBeVisible();
    await expect(button).toBeVisible();

    const limit = await visibleLimit(page);
    await test.info().attach("first-screen-layout", {
      contentType: "application/json",
      body: JSON.stringify({
        locale: visual.locale,
        viewport: page.viewportSize(),
        visibleLimit: limit,
        title: await title.boundingBox(),
        primaryAction: await button.boundingBox(),
        metadata: await card.locator(".brief-action-meta").boundingBox(),
      }),
    });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await bottom(title)).toBeLessThanOrEqual(limit);
    expect(await bottom(button)).toBeLessThanOrEqual(limit);
    // A visible button can still be covered by the fixed navigation.
    expect(await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);

    // The methodology is one tap away, closed until asked for.
    const disclosure = page.locator("details.trust-disclosure");
    await expect(disclosure).not.toHaveAttribute("open");
    await expect(page.locator(".workspace-agent-strip")).toBeHidden();
    await disclosure.locator("summary").click();
    await expect(disclosure).toHaveAttribute("open", "");
    await expect(disclosure.locator("summary")).toContainText(visual.trust);
    await expect(page.locator(".workspace-agent-strip")).toBeVisible();
    await disclosure.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(disclosure).not.toHaveAttribute("open");
    await expect(page.locator(".workspace-agent-strip")).toBeHidden();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
