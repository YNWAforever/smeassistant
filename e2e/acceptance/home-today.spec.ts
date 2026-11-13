import type { Locator, Page } from "@playwright/test";
import { test, expect, signIn } from "../../test/e2e/fixtures";

/**
 * The redesigned Today answers one question on a 375×812 phone: what should I
 * do next? The next task, its explanation and its button must be visible
 * without scrolling, and no score, evidence gallery or fixed mobile nav may
 * cover them.
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
  { locale: "en", heading: "Today", why: "Why this?", unavailable: "The recorded finding details are unavailable." },
  { locale: "zh-HK", heading: "今日", why: "點解係呢件？", unavailable: "暫時未能讀取已記錄嘅發現。" },
  { locale: "zh-TW", heading: "今天", why: "為什麼是這件？", unavailable: "目前無法讀取已記錄的發現。" },
] as const) {
  test(`owner home shows one next step above the fold at 375px (${visual.locale})`, async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant, "owner");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${visual.locale}/owner/${merchant.slug}?location=primary`);

    const card = page.locator(".home-v2-next").first();
    await expect(page.locator("h1")).toHaveText(visual.heading);
    const title = card.locator("h2");
    const sentence = card.locator(".home-v2-next-body");
    const button = card.locator(".home-v2-next-actions a").first();
    await expect(title).toBeVisible();
    await expect(sentence).toBeVisible();
    await expect(button).toBeVisible();
    await expect(card.locator(".home-v2-next-meta")).toBeVisible();

    const limit = await visibleLimit(page);
    await test.info().attach("first-screen-layout", {
      contentType: "application/json",
      body: JSON.stringify({
        locale: visual.locale,
        viewport: page.viewportSize(),
        visibleLimit: limit,
        title: await title.boundingBox(),
        sentence: await sentence.boundingBox(),
        primaryAction: await button.boundingBox(),
      }),
    });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await bottom(title)).toBeLessThanOrEqual(limit);
    expect(await bottom(sentence)).toBeLessThanOrEqual(limit);
    expect(await bottom(button)).toBeLessThanOrEqual(limit);
    // A visible button can still be covered by the fixed navigation.
    expect(await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);

    // Home carries no score, evidence gallery or agent strip; the explanation is
    // one closed disclosure on the task itself.
    await expect(page.locator(".brief-score-card, .owner-results-disclosure, .workspace-agent-strip, .owner-brief-grid")).toHaveCount(0);
    const why = card.locator("details.home-v2-why");
    await expect(why).not.toHaveAttribute("open");
    await why.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(why).toHaveAttribute("open", "");
    await expect(why.locator("summary")).toHaveText(visual.why);
    // The base merchant fixture has no recorded finding keys or evidence.
    // A task's existence alone must not be promoted to an observation.
    await expect(why).toContainText(visual.unavailable);
    await expect(why.locator(".fact-unknown")).toHaveCount(2);
    await expect(why.locator(".fact-observed")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(why).not.toHaveAttribute("open");

    // One Kinnso entry stays below the task; it is a link, never an inline assistant sheet.
    await expect(page.locator(".home-v2-ask")).toBeVisible();
    await expect(page.locator(".home-v2-ask a[href*='ask=']")).toHaveCount(3);
    await expect(page.locator(".assistant-launcher")).toHaveCount(0);
    await expect(page.locator(".home-v2-month")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("owner-today-mobile.png"), fullPage: true });
  });
}

test("desktop Business owns the supporting tools, and old links land on their new place", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant, "owner");
  await page.goto(`/en/owner/${merchant.slug}?location=all`);
  const sidebar = page.locator(".workspace-sidebar");
  // Kinnso only appears when the conversation flags are on; acceptance leaves them off.
  await expect(sidebar.locator("[data-slot='sidebar-menu'] a")).toHaveCount(4);
  await expect(sidebar.locator("[data-slot='sidebar-menu'] a")).toHaveText(["Today", "Tasks", "Results", "Business"]);
  await page.screenshot({ path: test.info().outputPath("owner-today-desktop.png"), fullPage: true });
  const business = sidebar.getByRole("link", { name: "Business", exact: true });
  await business.click();
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/business?location=all`);
  await expect(business).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".workspace-topbar-context strong")).toHaveText("Business");
  await page.screenshot({ path: test.info().outputPath("owner-business-desktop.png"), fullPage: true });
  // Business is shop facts, locations, photos and connections; Settings is not repeated here.
  const rows = page.locator(".destination-list");
  await expect(rows.locator("a strong")).toHaveText(["What we can say", "Locations", "Photos and menus", "Google and Instagram"]);
  await page.getByRole("link", { name: /Photos and menus/ }).click();
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/business/assets?location=all`);
  await expect(sidebar.getByRole("link", { name: "Business", exact: true })).toHaveAttribute("aria-current", "page");
  // Old addresses keep working: Calendar lands on the Due view, Create on New.
  await page.goto(`/en/owner/${merchant.slug}/calendar?location=all`);
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/actions?location=all&view=due`);
  await page.goto(`/en/owner/${merchant.slug}/create`);
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/actions/new`);
  // Settings is one account-menu step away, not a sixth destination.
  await page.locator(".account-button:visible").click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/settings`);
});
