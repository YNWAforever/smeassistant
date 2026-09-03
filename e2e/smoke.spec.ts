import { expect, test } from "@playwright/test";

import { DEFAULT_LOCALE } from "@/lib/locale";

/**
 * Route-level smoke: every public segment answers 200 and carries the brand
 * title, and `<html lang>` matches the URL locale — which is the only proof
 * that proxy.ts → LOCALE_HEADER → the root layout is wired end to end
 * (the root layout cannot see the [locale] route param).
 *
 * No database and no provider is touched, so this runs everywhere.
 */
const ROUTES: Array<{ path: string; lang: string; finalPath: string }> = [
  { path: "/", lang: DEFAULT_LOCALE, finalPath: `/${DEFAULT_LOCALE}` },
  { path: "/zh-HK", lang: "zh-HK", finalPath: "/zh-HK" },
  { path: "/en", lang: "en", finalPath: "/en" },
  { path: "/zh-TW", lang: "zh-TW", finalPath: "/zh-TW" },
  { path: "/zh-HK/pricing", lang: "zh-HK", finalPath: "/zh-HK/pricing" },
  { path: "/zh-HK/sample-report", lang: "zh-HK", finalPath: "/zh-HK/sample-report" },
];

for (const route of ROUTES) {
  test(`public route ${route.path} renders`, async ({ page }) => {
    const response = await page.goto(route.path);
    expect(response?.status(), `${route.path} should answer 200`).toBe(200);
    expect(new URL(page.url()).pathname).toBe(route.finalPath);
    await expect(page).toHaveTitle(/SME Scanner/);
    await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
  });
}

test("an unknown locale-shaped path is a 404, not a demo page", async ({ page }) => {
  const response = await page.goto("/zh-HK/not-a-real-page");
  expect(response?.status()).toBe(404);
});
