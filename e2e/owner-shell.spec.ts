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

/**
 * Phase 4 journey: draft → approve → export (CLAUDE.md Phase 4 verification).
 * Needs a Supabase project with a seeded workspace the E2E owner belongs to
 * (`E2E_WORKSPACE_SLUG`), a signed-in session (`E2E_STORAGE_STATE`, a
 * Playwright storageState captured after the magic link) and an LLM key or
 * the run route's test stub. Until that lands, the manual path is:
 *   a. Sign in, open /owner/<slug>/actions?location=<primary>, pick an action
 *      whose template has an agent (e.g. "Reply to unanswered Google reviews").
 *   b. "Generate a draft" → the run row appears under Workflow states and
 *      version 1 appears under Version & audit history (run.started /
 *      run.succeeded / version.created in the audit-mini list).
 *      If the agent asks for inputs, fill the form and "Save inputs and generate".
 *   c. Edit the caption and "Save manual edits as a new version" → version 2,
 *      version 1 shows "Superseded".
 *   d. "Approve Version 2" → dialog → approve; the delivery card enables.
 *      Approving again reports "already approved" without a new audit row.
 *   e. "Export approved version" downloads `<template>-v2.md`; the sidebar
 *      usage increments by one. "Copy text" afterwards does not increment.
 *   f. On a lite workspace at its allowance, export shows the allowance card
 *      with the billing link instead of a download.
 */
test.describe("draft → approve → export", () => {
  test.skip(!SUPABASE_CONFIGURED || !process.env.E2E_STORAGE_STATE || !process.env.E2E_WORKSPACE_SLUG, "Needs NEXT_PUBLIC_SUPABASE_URL, E2E_STORAGE_STATE (signed-in owner) and E2E_WORKSPACE_SLUG (seeded workspace).");
  test.use({ storageState: process.env.E2E_STORAGE_STATE });

  test("generates, edits, approves and exports one exact version", async ({ page }) => {
    const slug = process.env.E2E_WORKSPACE_SLUG!;
    await page.goto(`/zh-HK/owner/${slug}/actions`);
    await page.locator(".action-card a[href*='/actions/']").first().click();
    await expect(page.locator(".action-detail-page")).toBeVisible();

    await page.getByRole("button", { name: /生成草稿|Generate a draft|重新生成|Regenerate/ }).click();
    await expect(page.locator(".version-list button").first()).toBeVisible({ timeout: 90_000 });

    await page.fill("#draft-content", `${await page.inputValue("#draft-content")}\n\n多謝支持。`);
    await page.getByRole("button", { name: /儲存手動修改|Save manual edits/ }).click();
    await expect(page.locator(".version-list button")).toHaveCount(2);

    await page.getByRole("button", { name: /^核准第 2 版|^Approve Version 2/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /核准第 2 版|Approve Version 2/ }).click();
    await expect(page.locator(".approved-state")).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /匯出已核准版本|Export approved version/ }).click();
    expect((await download).suggestedFilename()).toMatch(/-v2\.md$/);
  });
});

test("/zh-HK/demo-workspace keeps the demo shell and the demo bar", async ({ page }) => {
  const response = await page.goto("/zh-HK/demo-workspace");
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toContainText("錦汶館");
  await expect(page.locator(".prototype-bar")).toBeVisible();
});
