import type { Locator, Page } from "@playwright/test";
import { test, expect, signIn } from "../../test/e2e/fixtures";

/**
 * FA-04: on a 375×812 phone the owner sees today's next step and its button
 * without scrolling, and nothing hides it — not the closed why-this
 * disclosure and not the fixed mobile bottom nav.
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
  { locale: "en", heading: "Today", why: "Why this?" },
  { locale: "zh-HK", heading: "今日", why: "點解係呢件？" },
  { locale: "zh-TW", heading: "今天", why: "為什麼是這件？" },
] as const) {
  test(`owner home shows today's action above the fold at 375px (${visual.locale})`, async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant, "owner");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${visual.locale}/owner/${merchant.slug}`);

    const card = page.locator(".home-v2-next").first();
    await expect(page.locator("h1")).toContainText(visual.heading);
    const title = card.locator("h2");
    const sentence = card.locator(".home-v2-next-body");
    const button = card.locator(".home-v2-next-actions a").first();
    await expect(title).toBeVisible();
    await expect(sentence).toBeVisible();
    await expect(button).toBeVisible();

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

    const why = card.locator("details.home-v2-why");
    await expect(why).not.toHaveAttribute("open");
    await expect(why.locator("summary")).toContainText(visual.why);
    // Scores, methodology and the old assistant strip moved off Today.
    await expect(page.locator(".brief-score-card")).toHaveCount(0);
    await expect(page.locator(".owner-results-disclosure")).toHaveCount(0);
    await expect(page.locator("details.trust-disclosure")).toHaveCount(0);
    await expect(page.locator(".workspace-agent-strip")).toHaveCount(0);
    await expect(page.locator(".brief-priority-card")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("owner-daily-focus-mobile.png"), fullPage: true });
    await why.locator("summary").click();
    await expect(why).toHaveAttribute("open", "");
    await why.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(why).not.toHaveAttribute("open");

    await expect(page.locator(".home-v2-ask")).toBeVisible();
    await expect(page.locator(".home-v2-month")).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("desktop Business reaches supporting tools, and old links land on their new place", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant, "owner");
  await page.goto(`/en/owner/${merchant.slug}?location=all`);
  const sidebar = page.locator(".workspace-sidebar");
  // CI merchant acceptance does not enable CONVERSATION_HOME, so Kinnso is omitted.
  await expect(sidebar.locator("[data-slot='sidebar-menu'] a")).toHaveText(["Today", "Tasks", "Results", "Business"]);
  await page.screenshot({ path: test.info().outputPath("owner-daily-focus-desktop.png"), fullPage: true });
  const business = sidebar.getByRole("link", { name: "Business", exact: true });
  await business.click();
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/business?location=all`);
  await expect(business).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".workspace-topbar-context strong")).toHaveText("Business");
  await page.screenshot({ path: test.info().outputPath("owner-business-desktop.png"), fullPage: true });
  await page.getByRole("link", { name: /Photos and menus/ }).click();
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/business/assets?location=all`);
  await expect(sidebar.getByRole("link", { name: "Business", exact: true })).toHaveAttribute("aria-current", "page");
  // Old addresses keep working: Calendar lands on the Due view, Create on New.
  await page.goto(`/en/owner/${merchant.slug}/calendar?location=all`);
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/actions?location=all&view=due`);
  await page.goto(`/en/owner/${merchant.slug}/create`);
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/actions/new`);
});
