import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

type MailSummary = { ID: string; To: { Address: string }[] };

for (const role of ["owner", "viewer"] as const) {
  test(`accepted ${role} receives a fresh magic link and can sign in again`, async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant, role);
    const accepted = sql(environment.db, `select accepted_at from workspace_members where workspace_id='${merchant.workspaceId}' and role='${role}';`);
    expect(accepted).not.toBe("");
    const messages = async (): Promise<MailSummary[]> => (await (await fetch(`${environment.mail}/api/v1/messages`)).json()).messages;
    const oldIds = new Set((await messages()).map(message => message.ID));
    expect((await page.request.post("/api/auth/sign-out")).status()).toBe(200);
    await page.goto(`/en/owner/sign-in?returnTo=${encodeURIComponent(`/en/owner/${merchant.slug}`)}`);
    await page.locator("#sign-in-email").fill(merchant.emails[role]);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByText(/Check your inbox/)).toBeVisible();
    let fresh: MailSummary | undefined;
    await expect(async () => {
      fresh = (await messages()).find(message => !oldIds.has(message.ID) && message.To.some(to => to.Address === merchant.emails[role]));
      expect(fresh).toBeDefined();
    }).toPass({ timeout: 15000 });
    const mail = await (await fetch(`${environment.mail}/api/v1/message/${fresh!.ID}`)).json() as { HTML: string };
    const links = [...mail.HTML.matchAll(/href=["']([^"']+)["']/g)].map(match => match[1].replaceAll("&amp;", "&"));
    const link = links.find(value => value.startsWith(`${environment.app}/api/auth/verify?`));
    expect(link).toBeDefined();
    await page.goto(link!);
    await expect(page).toHaveURL(new RegExp(`/en/owner/${merchant.slug}$`));
    expect(sql(environment.db, `select accepted_at from workspace_members where workspace_id='${merchant.workspaceId}' and role='${role}';`)).toBe(accepted);
  });
}