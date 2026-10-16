import type { Page } from "@playwright/test";
import { test, expect } from "../../test/e2e/fixtures";
import { sql, type AcceptanceEnvironment } from "../../test/e2e/environment";

// OTPs and session material stay out of screenshots, video and Playwright traces.
test.use({ trace: "off", screenshot: "off", video: "off" });

type Message = { ID: string; To: { Address: string }[]; Text: string };
async function messages(env: AcceptanceEnvironment): Promise<Message[]> {
  return (await (await fetch(`${env.mail}/api/v1/messages`)).json()).messages;
}
async function latestCode(env: AcceptanceEnvironment, email: string) {
  const message = (await messages(env)).find(item => item.To.some(to => to.Address === email) && /^\d{6}$/.test(item.Text));
  expect(Boolean(message)).toBe(true);
  return message!.Text;
}
async function requestCode(page: Page, env: AcceptanceEnvironment, email: string, destination: string) {
  await page.goto(`/en/owner/sign-in?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a code", exact: true }).click();
  await expect(page.getByLabel("6-digit code", { exact: true })).toBeVisible();
  return latestCode(env, email);
}
async function verify(page: Page, otp: string) {
  await page.getByLabel("6-digit code", { exact: true }).fill(otp);
  await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
}
function membership(env: AcceptanceEnvironment, workspace: string, role = "owner") {
  return sql(env.db, `select coalesce(user_id::text,'')||':'||coalesce(accepted_at::text,'') from workspace_members where workspace_id='${workspace}' and role='${role}';`);
}
const accepted = (env: AcceptanceEnvironment, workspace: string) =>
  sql(env.db, `select count(*) from workspace_members where workspace_id='${workspace}' and accepted_at is not null;`);

test("LOCAL OTP rejects wrong and expired codes, then accepts one fresh code and refuses consumed replay", async ({ page, merchant, environment }) => {
  const destination = `/en/owner/${merchant.slug}`;
  const first = await requestCode(page, environment, merchant.emails.owner, destination);
  await verify(page, first === "000000" ? "000001" : "000000");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("That code is invalid or has expired.");
  expect(accepted(environment, merchant.workspaceId)).toBe("0");
  await environment.expireCode(merchant.emails.owner);
  await verify(page, first);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("That code is invalid or has expired.");
  expect(accepted(environment, merchant.workspaceId)).toBe("0");
  const current = await requestCode(page, environment, merchant.emails.owner, destination);
  await verify(page, current);
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  const saved = membership(environment, merchant.workspaceId);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  expect(membership(environment, merchant.workspaceId)).toBe(saved);
  expect((await page.request.post("/api/auth/sign-out")).status()).toBe(200);
  const replay = await page.request.post("/api/auth/sign-in/email-otp", {
    headers: { origin: environment.app }, data: { email: merchant.emails.owner, otp: current },
  });
  expect(replay.status()).toBe(401);
  await page.goto(destination);
  await expect(page).toHaveURL(/\/en\/owner\/sign-in\?/);
  expect(membership(environment, merchant.workspaceId)).toBe(saved);
});

test("LOCAL resend honors the client cooldown, rotates the fixture code and leaves the old code unusable", async ({ page, merchant, environment }) => {
  const destination = `/en/owner/${merchant.slug}`;
  const previous = await requestCode(page, environment, merchant.emails.owner, destination);
  await expect(page.getByRole("button", { name: /Send another code in/ })).toBeDisabled();
  await page.clock.install();
  await page.clock.fastForward(60_000);
  const resend = page.getByRole("button", { name: "Send another code", exact: true });
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect(page.getByRole("button", { name: /Send another code in/ })).toBeDisabled();
  const current = await latestCode(environment, merchant.emails.owner);
  await verify(page, previous);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("That code is invalid or has expired.");
  expect(accepted(environment, merchant.workspaceId)).toBe("0");
  await verify(page, current);
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
});

test("LOCAL request budget stops after five deliveries and the UI counts down without sending automatically", async ({ page, merchant, environment }) => {
  const destination = `/en/owner/${merchant.slug}`;
  await requestCode(page, environment, merchant.emails.owner, destination);
  for (let attempt = 1; attempt < 5; attempt++) {
    const sent = await page.request.post("/api/auth/email-otp/send-verification-otp", {
      headers: { origin: environment.app },
      data: { email: merchant.emails.owner, type: "sign-in", callbackURL: `/auth/callback?locale=en&method=email&returnTo=${encodeURIComponent(destination)}` },
    });
    expect(sent.status()).toBe(200);
  }
  const delivered = () => messages(environment).then(items => items.filter(item => item.To.some(to => to.Address === merchant.emails.owner)).length);
  expect(await delivered()).toBe(5);
  await page.clock.install(); await page.clock.fastForward(60_000);
  const refused = page.waitForResponse(response => response.url().endsWith("/api/auth/email-otp/send-verification-otp") && response.status() === 429);
  await page.getByRole("button", { name: "Send another code", exact: true }).click();
  const response = await refused;
  const retry = Number(response.headers()["retry-after"]);
  expect(retry > 0 && retry <= 3600).toBe(true);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("no new code was sent");
  await expect(page.getByRole("button", { name: /Send another code in/ })).toBeDisabled();
  await page.clock.fastForward(retry * 1000);
  await expect(page.getByRole("button", { name: "Send another code", exact: true })).toBeEnabled();
  expect(await delivered()).toBe(5);
  expect(accepted(environment, merchant.workspaceId)).toBe("0");
});

test("LOCAL verify budget blocks the eleventh attempt and the UI preserves its countdown without acquiring ownership", async ({ page, merchant, environment }) => {
  const current = await requestCode(page, environment, merchant.emails.owner, `/en/owner/${merchant.slug}`);
  const wrong = current === "000000" ? "000001" : "000000";
  for (let attempt = 0; attempt < 10; attempt++) {
    const refused = await page.request.post("/api/auth/sign-in/email-otp", {
      headers: { origin: environment.app }, data: { email: merchant.emails.owner, otp: wrong },
    });
    expect(refused.status()).toBe(401);
  }
  await page.clock.install();
  const limited = page.waitForResponse(response => response.url().endsWith("/api/auth/sign-in/email-otp") && response.status() === 429);
  await verify(page, current);
  const response = await limited;
  const retry = Number(response.headers()["retry-after"]);
  expect(retry > 0 && retry <= 3600).toBe(true);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Too many verification attempts");
  await expect(page.getByRole("button", { name: /Verify again in/ })).toBeDisabled();
  let moreAttempts = 0;
  page.on("request", request => { if (request.url().endsWith("/api/auth/sign-in/email-otp")) moreAttempts++; });
  await page.clock.fastForward(retry * 1000);
  await expect(page.getByRole("button", { name: "Verify and continue", exact: true })).toBeEnabled();
  expect(moreAttempts).toBe(0);
  expect(accepted(environment, merchant.workspaceId)).toBe("0");
});

test("LOCAL expired-session reload requires relogin, sign-out removes access, and switching identity cannot replace the existing owner", async ({ page, merchant, environment }) => {
  const destination = `/en/owner/${merchant.slug}`;
  await verify(page, await requestCode(page, environment, merchant.emails.owner, destination));
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  const owner = membership(environment, merchant.workspaceId);
  await environment.expireSessions(merchant.emails.owner);
  await page.reload();
  await expect(page).toHaveURL(/\/en\/owner\/sign-in\?/);
  await verify(page, await requestCode(page, environment, merchant.emails.owner, destination));
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  expect(membership(environment, merchant.workspaceId)).toBe(owner);
  expect((await page.request.post("/api/auth/sign-out")).status()).toBe(200);
  await page.goto(destination);
  await expect(page).toHaveURL(/\/en\/owner\/sign-in\?/);
  await verify(page, await requestCode(page, environment, merchant.emails.viewer, "/en/owner/select-workspace"));
  await expect(page).toHaveURL(/\/en\/owner\/select-workspace$/);
  await expect(page.getByText(`Signed in as ${merchant.emails.viewer}`, { exact: true })).toBeVisible();
  expect(accepted(environment, merchant.workspaceId)).toBe("2");
  expect(membership(environment, merchant.workspaceId)).toBe(owner);
  expect(membership(environment, merchant.workspaceId, "viewer").split(":")[0]).not.toBe(owner.split(":")[0]);
  const forged = await page.request.post("/api/owner/sign-in/complete", {
    headers: { origin: environment.app },
    data: { locale: "en", method: "email", email: merchant.emails.owner, verifiedEmail: merchant.emails.owner, role: "owner" },
  });
  expect(forged.status()).toBe(400);
  expect(membership(environment, merchant.workspaceId)).toBe(owner);
});

for (const scenario of [
  { locale: "en", email: "Try email instead", google: "Try Google again", label: "Email address" },
  { locale: "zh-HK", email: "改用電郵", google: "再試一次 Google", label: "電郵地址" },
  { locale: "zh-TW", email: "改用電子郵件", google: "再試一次 Google", label: "電子郵件地址" },
] as const) {
  test(`LOCAL legacy invalid-code recovery offers explicit email-code and Google alternatives (${scenario.locale})`, async ({ page, merchant }) => {
    const destination = `/${scenario.locale}/owner/${merchant.slug}`;
    await page.goto(`/${scenario.locale}/owner/sign-in?error=invalid_code&returnTo=${encodeURIComponent(destination)}`);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    const google = page.getByRole("link", { name: scenario.google, exact: true });
    await expect(google).toHaveAttribute("href", new RegExp("method=google"));
    expect(new URL(await google.getAttribute("href") ?? "", "http://localhost").searchParams.get("returnTo")).toBe(destination);
    await page.getByRole("button", { name: scenario.email, exact: true }).click();
    await expect(page.getByLabel(scenario.label, { exact: true })).toBeEnabled();
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(destination);
  });
}
