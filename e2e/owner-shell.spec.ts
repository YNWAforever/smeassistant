import { expect, test } from "@playwright/test";

/**
 * Phase 2 owner shell (CLAUDE.md Phase 2 verification):
 *
 *  1. No-env checks, run everywhere: the real sign-in page renders its
 *     magic-link form, and the gated pages bounce a signed-out visitor to it.
 *     Without Supabase env the proxy gate is skipped and `getUser()` resolves
 *     null, so `requireUser` performs the same redirect — either way the final
 *     URL is `/owner/sign-in?returnTo=…`.
 *
 *  2. The full walk needs a Supabase project *and* a local mail sink, so it
 *     is opt-in via `E2E_MAGIC_LINK_LOCAL=true`. Manual flow, until that lands:
 *       a. Free scan → unlock the report with an email → /owner/sign-in?claim=<slug>.
 *       b. Submit the email; open the magic link from the local inbox
 *          (Supabase Auth → /auth/callback?code=&claim=<slug>).
 *       c. Land on /owner/onboarding?claim=<slug>: step 1 shows the job's
 *          business name / district / report ref (never 錦汶館).
 *       d. With WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true, "Verify with Google"
 *          → claim callback → onboarding?claim=&claimed=1; steps 3–4 unlock.
 *       e. "Open workspace" → /owner/<slug>: the sidebar shows the real
 *          workspace name, avatar initial, primary location, `n / allowance`
 *          usage, the signed-in account and role label, and no Demo badge.
 */
const SUPABASE_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const MAGIC_LINK_LOCAL = process.env.E2E_MAGIC_LINK_LOCAL === "true";

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

test.describe("magic link (local) → onboarding → workspace shell", () => {
  test.skip(!SUPABASE_CONFIGURED || !MAGIC_LINK_LOCAL, "Needs NEXT_PUBLIC_SUPABASE_URL and E2E_MAGIC_LINK_LOCAL=true (a local Supabase Auth with a mail sink).");

  test("submitting the sign-in form reaches the inbox state", async ({ page }) => {
    await page.goto("/zh-HK/owner/sign-in");
    await page.fill("#sign-in-email", process.env.E2E_OWNER_EMAIL ?? "owner@example.com");
    await page.click("form button[type=submit]");
    await expect(page.locator("main.auth-page .onboarding-choice")).toBeVisible();
  });
});
