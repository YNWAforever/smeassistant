import { test, expect } from "../../test/e2e/fixtures";
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
  await environment.setFixtureFault("upstream");
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