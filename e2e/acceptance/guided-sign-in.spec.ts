import { test, expect, requestSignInLink } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

test("owned Google-style handoff shows processing before the authorized destination", async ({ page, merchant, environment }) => {
  await environment.selectGoogleAccount(merchant.emails.owner);
  await environment.holdCompletion();
  await page.goto(`/zh-HK/owner/sign-in?returnTo=${encodeURIComponent(`/zh-HK/owner/${merchant.slug}`)}`);
  await page.getByRole("button", { name: "使用 Google 繼續", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("正在核實你的工作台存取權");
  await environment.releaseCompletion();
  await expect(page).toHaveURL(new RegExp(`/zh-HK/owner/${merchant.slug}$`));
});

test("local Google cancellation retains the destination while switching to email", async ({ page, merchant, environment }) => {
  await environment.selectGoogleAccount(merchant.emails.owner);
  await environment.setFixtureFault("cancelled");
  const destination = `/en/owner/${merchant.slug}`;
  await page.goto(`/en/owner/sign-in?returnTo=${encodeURIComponent(destination)}`);
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page.getByText("Google sign-in was cancelled.")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(destination);
  await page.getByRole("link", { name: "Try email instead", exact: true }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  const url = new URL(page.url());
  expect(url.searchParams.get("returnTo")).toBe(destination);
  expect(url.searchParams.get("method")).toBe("email");
});

test("an accepted fixture account is not required for no-access recovery or a rejected cross-origin completion", async ({ page, merchant, environment }) => {
  const accepted = () => sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and accepted_at is not null;`);
  expect((await page.request.post("/api/owner/sign-in/complete", { headers: { origin: "https://outside.example" }, data: { locale: "en" } })).status()).toBe(400);
  expect(accepted()).toBe("0");
  await environment.selectGoogleAccount(`outside-${merchant.workspaceId}@acceptance.test`);
  await page.goto("/en/owner/sign-in");
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page.getByText("This account does not have access to a workspace yet.")).toBeVisible();
  expect(accepted()).toBe("0");
  await page.getByRole("button", { name: "Change account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
});
const acceptedMemberships = (environment: { db: string }, workspaceId: string) => sql(environment.db, `select count(*) from workspace_members where workspace_id='${workspaceId}' and accepted_at is not null;`);

for (const fault of ["mapping", "binding", "revoked", "upstream"] as const) {
  test(`fixture completion fault ${fault} reaches recovery without acquiring workspace authority`, async ({ page, merchant, environment }) => {
    await environment.selectGoogleAccount(merchant.emails.owner);
    await environment.setFixtureFault(fault);
    await page.goto(`/en/owner/sign-in?returnTo=${encodeURIComponent(`/en/owner/${merchant.slug}`)}`);
    await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
    await expect(page.getByText("We could not finish Google sign-in. Start a new Google sign-in attempt.", { exact: true })).toBeVisible();
    expect(acceptedMemberships(environment, merchant.workspaceId)).toBe("0");
  });
}

test("changing from an unavailable account to the authorized account retains the destination", async ({ page, merchant, environment }) => {
  const destination = `/en/owner/${merchant.slug}`;
  await environment.selectGoogleAccount(`outside-${merchant.workspaceId}@acceptance.test`);
  await page.goto(`/en/owner/sign-in?returnTo=${encodeURIComponent(destination)}`);
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page.getByText("This account does not have access to a workspace yet.", { exact: true })).toBeVisible();
  await environment.selectGoogleAccount(merchant.emails.owner);
  await page.getByRole("button", { name: "Change account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(destination);
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
});

test("a consumed local email link cannot change an accepted membership", async ({ page, merchant, environment }) => {
  const link = await requestSignInLink(page, environment, merchant);
  await page.goto(link);
  await expect(page).toHaveURL(new RegExp(`/en/owner/${merchant.slug}$`));
  const accepted = acceptedMemberships(environment, merchant.workspaceId);
  await page.request.post("/api/auth/sign-out");
  await page.goto(link);
  await expect(page).toHaveURL(/owner\/sign-in\?error=invalid_token/);
  expect(acceptedMemberships(environment, merchant.workspaceId)).toBe(accepted);
});
const visualCases = [
  { locale: "en", width: 375, google: "Continue with Google", processing: "Checking your workspace access…" },
  { locale: "en", width: 1440, google: "Continue with Google", processing: "Checking your workspace access…" },
  { locale: "zh-HK", width: 375, google: "使用 Google 繼續", processing: "正在核實你的工作台存取權…" },
  { locale: "zh-HK", width: 1440, google: "使用 Google 繼續", processing: "正在核實你的工作台存取權…" },
  { locale: "zh-TW", width: 375, google: "使用 Google 繼續", processing: "正在核實你的工作台存取權…" },
  { locale: "zh-TW", width: 1440, google: "使用 Google 繼續", processing: "正在核實你的工作台存取權…" },
] as const;

for (const visual of visualCases) {
  test(`owned sign-in start card is keyboard-operable without overflow: ${visual.locale} ${visual.width}`, async ({ page, merchant, environment }) => {
    await page.setViewportSize({ width: visual.width, height: 900 });
    await environment.selectGoogleAccount(merchant.emails.owner);
    await environment.holdCompletion();
    try {
      await page.goto(`/${visual.locale}/owner/sign-in?returnTo=${encodeURIComponent(`/${visual.locale}/owner/${merchant.slug}`)}`);
      const google = page.getByRole("button", { name: visual.google, exact: true });
      await expect(google).toBeVisible();
      await expect(google).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/task-5-sign-in-${visual.locale}-${visual.width}.png`, fullPage: true });
      await google.focus();
      await expect(google).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status")).toContainText(visual.processing);
    } finally {
      await environment.releaseCompletion().catch(() => {});
    }
    await expect(page).toHaveURL(new RegExp(`/${visual.locale}/owner/${merchant.slug}$`));
  });
}