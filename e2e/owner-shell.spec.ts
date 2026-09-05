import { expect, test } from "@playwright/test";

/** Public signed-out owner checks. Authenticated coverage is required in acceptance. */

test("/zh-HK/owner/sign-in renders the magic-link form", async ({ page }) => {
  const response = await page.goto("/zh-HK/owner/sign-in");
  expect(response?.status()).toBe(200);
  await expect(page.locator("main.auth-page")).toBeVisible();
  await expect(page.locator("#sign-in-email")).toBeVisible();
  await expect(page.locator("form button[type=submit]")).toBeVisible();
  // No Google sign-in and no demo badge on a real auth page.
  await expect(page.getByText(/Continue with (ChatGPT|Google)/)).toHaveCount(0);
  await expect(page.locator("main.auth-page .demo-badge")).toHaveCount(0);
});

test("/zh-HK/owner/sign-in?error=invalid_code explains the failed link", async ({ page }) => {
  await page.goto("/zh-HK/owner/sign-in?error=invalid_code&claim=sample-slug");
  await expect(page.locator(".form-error[role=alert]")).toBeVisible();
});

test("/zh-HK/owner/select-workspace without a session redirects to sign-in", async ({ page }) => {
  await page.goto("/zh-HK/owner/select-workspace");
  await expect(page).toHaveURL(/\/zh-HK\/owner\/sign-in\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/zh-HK/owner/select-workspace");
});

test("/zh-HK/owner/onboarding without a session redirects to sign-in, keeping the claim", async ({ page }) => {
  await page.goto("/zh-HK/owner/onboarding?claim=sample-slug");
  await expect(page).toHaveURL(/\/zh-HK\/owner\/sign-in\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toContain("claim=sample-slug");
});

test("a workspace URL without a session redirects to sign-in", async ({ page }) => {
  await page.goto("/zh-HK/owner/kam-man-house");
  await expect(page).toHaveURL(/\/zh-HK\/owner\/sign-in\?returnTo=/);
});

test("the prototype bridge no longer serves the owner entry pages", async ({ page }) => {
  // The real routes out-rank the catch-all; a deeper path under them is a 404, not a demo page.
  const response = await page.goto("/zh-HK/owner/sign-in/extra");
  expect(response?.status()).toBe(404);
});



// Phase 3-6: every workspace page is a real route now (they redirect to
// sign-in without a session). The prototype bridge (`app/[...path]`) is gone,
// so nothing under /owner/<slug>/* can render demo data; the public demo page
// keeps its own route.
for (const segment of ["actions", "insights", "activity", "calendar", "more", "create", "assets", "settings/integrations", "settings/notifications", "settings/billing", "settings/team", "settings/brand"]) {
  test(`/zh-HK/owner/kam-man-house/${segment} is a real route that requires sign-in`, async ({ page }) => {
    await page.goto(`/zh-HK/owner/kam-man-house/${segment}`);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/zh-HK/owner/sign-in");
    // Without Supabase env the proxy gate is skipped and the layout-level membership check redirects,
    // which knows the workspace but not the sub-path (Phase 2 behaviour).
    expect(url.searchParams.get("returnTo")).toContain("/owner/kam-man-house");
  });
}

test("no /owner/kam-man-house/* path renders the prototype any more", async ({ page }) => {
  // An unknown sub-page is a plain 404 (no catch-all), never a demo workspace page.
  const response = await page.goto("/zh-HK/owner/kam-man-house/settings/unknown");
  expect(response?.status()).toBe(404);
  await expect(page.locator(".prototype-bar")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("錦汶館");
});
