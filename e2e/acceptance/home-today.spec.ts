import type { Locator, Page } from "@playwright/test";
import { test, expect, signIn } from "../../test/e2e/fixtures";

/**
 * FA-04: on a 375×812 phone the owner sees today's action and its button
 * without scrolling, and nothing hides it -- not the methodology (now inside
 * the closed disclosure) and not the fixed mobile bottom nav.
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
  { locale: "en", heading: "Start with this today.", trust: "Why you can trust this" },
  { locale: "zh-HK", heading: "而家最應做", trust: "點解咁講" },
  { locale: "zh-TW", heading: "今天先處理這一項", trust: "為何可信" },
] as const) {
  test(`owner home shows today's action above the fold at 375px (${visual.locale})`, async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant, "owner");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${visual.locale}/owner/${merchant.slug}`);

    const card = page.locator(".brief-priority-card").first();
    await expect(page.locator("h1")).toContainText(visual.heading);
    const title = card.locator("h2");
    const sentence = card.locator(".coach-sentence");
    const button = card.locator(".brief-priority-actions a");
    await expect(title).toBeVisible();
    await expect(sentence).toBeVisible();
    await expect(button).toBeVisible();
    await expect(card.locator(".brief-action-meta")).toHaveCount(0);

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

    const results = page.locator("details.owner-results-disclosure");
    const evidence = page.locator("details.owner-priority-evidence");
    await expect(results).not.toHaveAttribute("open");
    await expect(evidence).not.toHaveAttribute("open");
    await expect(page.locator(".brief-score-card")).toBeHidden();
    await expect(page.locator(".why-now-box").first()).toBeHidden();
    // Effort, phase and version stay in the closed 「why this first」 disclosure, not on the open card.
    await expect(evidence.locator(".brief-action-meta")).toBeHidden();
    await page.screenshot({ path: test.info().outputPath("owner-daily-focus-mobile.png"), fullPage: true });
    await evidence.locator("summary").click();
    await expect(evidence.locator(".why-now-box")).toBeVisible();
    await expect(evidence.locator(".brief-action-meta")).toBeVisible();
    await evidence.locator("summary").click();
    await results.locator("summary").click();
    await expect(results.locator(".brief-score-card")).toBeVisible();
    await expect(results.locator(".month-brief")).toBeVisible();
    await results.locator("summary").click();

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

test("desktop Business reaches supporting tools, and old links land on their new place", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant, "owner");
  await page.goto(`/en/owner/${merchant.slug}?location=all`);
  const sidebar = page.locator(".workspace-sidebar");
  await expect(sidebar.locator("[data-slot='sidebar-menu'] a")).toHaveCount(5);
  await page.screenshot({ path: test.info().outputPath("owner-daily-focus-desktop.png"), fullPage: true });
  const business = sidebar.getByRole("link", { name: "Business", exact: true });
  await business.click();
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/business?location=all`);
  await expect(business).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".workspace-topbar-context strong")).toHaveText("Business");
  await page.screenshot({ path: test.info().outputPath("owner-business-desktop.png"), fullPage: true });
  await page.getByRole("link", { name: /Assets/ }).click();
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/business/assets?location=all`);
  await expect(sidebar.getByRole("link", { name: "Business", exact: true })).toHaveAttribute("aria-current", "page");
  // Old addresses keep working: Calendar lands on the Due view, Create on New.
  await page.goto(`/en/owner/${merchant.slug}/calendar?location=all`);
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/actions?location=all&view=due`);
  await page.goto(`/en/owner/${merchant.slug}/create`);
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/actions/new`);
});
