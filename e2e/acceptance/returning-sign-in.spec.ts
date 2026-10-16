import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

type MailSummary = { ID: string; To: { Address: string }[] };

for (const scenario of [
  { role: "owner", locale: "en", width: 1440, firstSignIn: false },
  { role: "viewer", locale: "en", width: 1440, firstSignIn: false },
  { role: "owner", locale: "zh-HK", width: 375, firstSignIn: true },
] as const) {
  const { role, locale, width, firstSignIn } = scenario;
  test(`${locale} ${width}px ${firstSignIn ? "first" : "returning"} ${role} completes email-code sign-in`, async ({ page, merchant, environment }) => {
    await page.setViewportSize({ width, height: 900 });
    if (!firstSignIn) await signIn(page, environment, merchant, role);
    const accepted = sql(environment.db, `select accepted_at from workspace_members where workspace_id='${merchant.workspaceId}' and role='${role}';`);
    if (!firstSignIn) expect(accepted).not.toBe("");
    else expect(accepted).toBe("");
    const messages = async (): Promise<MailSummary[]> => (await (await fetch(`${environment.mail}/api/v1/messages`)).json()).messages;
    const oldIds = new Set((await messages()).map(message => message.ID));
    expect((await page.request.post("/api/auth/sign-out")).status()).toBe(200);
    await page.goto(`/${locale}/owner/sign-in?returnTo=${encodeURIComponent(`/${locale}/owner/${merchant.slug}`)}`);
    await page.locator("#sign-in-email").fill(merchant.emails[role]);
    await page.getByRole("button", { name: locale === "en" ? "Email me a code" : "寄出登入驗證碼" }).click();
    await expect(page.getByText(locale === "en" ? /Check your inbox/ : /請查看收件箱/)).toBeVisible();
    let fresh: MailSummary | undefined;
    await expect(async () => {
      fresh = (await messages()).find(message => !oldIds.has(message.ID) && message.To.some(to => to.Address === merchant.emails[role]));
      expect(fresh).toBeDefined();
    }).toPass({ timeout: 15000 });
    const mail = await (await fetch(`${environment.mail}/api/v1/message/${fresh!.ID}`)).json() as { Text: string };
    expect(mail.Text).toMatch(/^\d{6}$/);
    const code = page.getByLabel(locale === "en" ? "6-digit code" : "六位驗證碼");
    const verify = page.getByRole("button", { name: locale === "en" ? "Verify and continue" : "驗證並繼續" });
    await code.fill(mail.Text === "000000" ? "000001" : "000000");
    await verify.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(locale === "en" ? "That code is invalid or has expired." : "驗證碼不正確或已過期。");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`email-code-${locale}-${width}.png`), fullPage: true });
    await code.fill(mail.Text);
    await verify.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/owner/${merchant.slug}$`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${locale}/owner/${merchant.slug}$`));
    const savedAccepted = sql(environment.db, `select accepted_at from workspace_members where workspace_id='${merchant.workspaceId}' and role='${role}';`);
    expect(savedAccepted).not.toBe("");
    if (!firstSignIn) expect(savedAccepted).toBe(accepted);
    const replay = await page.request.post("/api/auth/sign-in/email-otp", {
      headers: { origin: environment.app }, data: { email: merchant.emails[role], otp: mail.Text },
    });
    expect(replay.status()).toBe(401);
    expect(sql(environment.db, `select accepted_at from workspace_members where workspace_id='${merchant.workspaceId}' and role='${role}';`)).toBe(savedAccepted);
  });
}
