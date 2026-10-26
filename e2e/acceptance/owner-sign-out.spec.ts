import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

test.use({ trace: "off", screenshot: "off", video: "off" });

for (const item of [
  { locale: "en", width: 1440, settings: "Shop", send: "Email me a code", verify: "Verify and continue" },
  { locale: "zh-HK", width: 390, settings: "舖", send: "寄出登入驗證碼", verify: "驗證並繼續" },
  { locale: "zh-TW", width: 390, settings: "店裡", send: "寄送登入驗證碼", verify: "驗證並繼續" },
]) {
  test(`existing owner signs out through the UI and signs back in with a code (${item.locale}, ${item.width}px)`, async ({ page, merchant, environment }, info) => {
    sql(environment.db, `insert into brand_profiles(workspace_id,voice) values ('${merchant.workspaceId}','professional');`);
    await signIn(page, environment, merchant);
    const membership = sql(environment.db, `select user_id::text||':'||accepted_at::text||':'||role from workspace_members where workspace_id='${merchant.workspaceId}' and role='owner';`);
    await page.setViewportSize({ width: item.width, height: 900 });
    await page.goto(`/${item.locale}/owner/${merchant.slug}`);
    if (item.width >= 768) {
      await expect(page.locator(".account-button")).toHaveAttribute("href", `/${item.locale}/owner/select-workspace`);
      await page.locator(".account-button").click();
    } else {
      // Phones: Shop › Switch workspace or sign out (the sidebar's account control is hidden).
      await page.getByRole("link", { name: item.settings, exact: true }).click();
      await page.getByRole("link", { name: /^切換工作台|^Switch workspace/ }).click();
    }
    await expect(page).toHaveURL(new RegExp(`/${item.locale}/owner/select-workspace$`));
    await expect(page.getByRole("link", { name: /Acceptance HK/ }).first()).toBeVisible();
    const signOut = page.getByRole("button", { name: /Sign out and use another email|登出.*登入/ });
    await signOut.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/owner\/sign-in\?/);
    expect(new URL(page.url()).searchParams.get("intent")).toBe("switch_account");
    expect((await page.request.get(`/api/workspaces/${merchant.workspaceId}/brand`)).status()).toBe(401);

    // Protected navigation must still require a session, not reuse the old UI.
    await page.goto(`/${item.locale}/owner/${merchant.slug}`);
    await expect(page).toHaveURL(/\/owner\/sign-in\?/);
    const messages = async () => (await (await fetch(`${environment.mail}/api/v1/messages`)).json()).messages as { ID: string; To: { Address: string }[] }[];
    const oldIds = new Set((await messages()).map(message => message.ID));
    await page.locator("#sign-in-email").fill(merchant.emails.owner);
    await page.getByRole("button", { name: item.send, exact: true }).click();
    await expect(page.locator("#sign-in-code")).toBeVisible();
    let fresh: { ID: string } | undefined;
    await expect(async () => {
      fresh = (await messages()).find(message => !oldIds.has(message.ID) && message.To.some(to => to.Address === merchant.emails.owner));
      expect(Boolean(fresh)).toBe(true);
    }).toPass({ timeout: 15000 });
    const mail = await (await fetch(`${environment.mail}/api/v1/message/${fresh!.ID}`)).json() as { Text: string };
    expect(/^\d{6}$/.test(mail.Text)).toBe(true);
    await page.locator("#sign-in-code").fill(mail.Text);
    await page.getByRole("button", { name: item.verify, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${item.locale}/owner/${merchant.slug}$`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${item.locale}/owner/${merchant.slug}$`));
    expect((await page.request.get(`/api/workspaces/${merchant.workspaceId}/brand`)).status()).toBe(200);
    expect(sql(environment.db, `select user_id::text||':'||accepted_at::text||':'||role from workspace_members where workspace_id='${merchant.workspaceId}' and role='owner';`)).toBe(membership);
    expect(sql(environment.db, `select voice from brand_profiles where workspace_id='${merchant.workspaceId}';`)).toBe("professional");
    expect(sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and role='owner';`)).toBe("1");
    await page.screenshot({ path: info.outputPath(`signed-in-again-${item.locale}.png`), fullPage: true });
  });
}
