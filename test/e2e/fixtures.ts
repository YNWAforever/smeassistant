import { test as base, expect, type Page } from "@playwright/test";
import { startEnvironment, type AcceptanceEnvironment } from "./environment";
import { seedMerchant, type MerchantSeed } from "./seed";
export const test = base.extend<{ merchant: MerchantSeed }, { environment: AcceptanceEnvironment }>({
  environment: [async ({}, runFixture) => { const env = await startEnvironment(); try { await runFixture(env); } finally { await env.stop(); } }, { scope: "worker", timeout: 240000 }],
  baseURL: async ({ environment }, runFixture) => runFixture(environment.app),
  merchant: async ({ environment }, runFixture) => runFixture(await seedMerchant(environment, "hk")),
});
export { expect };
export async function requestSignInLink(page: Page, env: AcceptanceEnvironment, merchant: MerchantSeed, role: keyof MerchantSeed["emails"] = "owner", claim?: string) {
  const signInUrl = new URL("/en/owner/sign-in", env.app);
  signInUrl.searchParams.set("returnTo", `/en/owner/${merchant.slug}`);
  if (claim) signInUrl.searchParams.set("claim", claim);
  await page.goto(signInUrl.toString());
  await page.locator("#sign-in-email").fill(merchant.emails[role]);
  await page.locator("form button[type=submit]").click();
  let link = "";
  await expect(async () => {
    const list = await (await fetch(`${env.mail}/api/v1/messages`)).json() as { messages: { ID: string; To: { Address: string }[] }[] };
    const message = list.messages.find((m) => m.To.some((to) => to.Address === merchant.emails[role]));
    expect(message).toBeDefined();
    const full = await (await fetch(`${env.mail}/api/v1/message/${message!.ID}`)).json() as { HTML: string; Text: string };
    const links = [...full.HTML.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1].replaceAll("&amp;", "&"));
    link = links.find((value) => value.startsWith(`${env.api}/auth/v1/verify?`)) ?? "";
    expect(link).not.toBe("");
  }).toPass({ timeout: 30000 });
  return link;
}


export async function signIn(page: Page, env: AcceptanceEnvironment, merchant: MerchantSeed, role: keyof MerchantSeed["emails"] = "owner") {
  const link = await requestSignInLink(page, env, merchant, role);
  await page.goto(link);
  await expect(page).toHaveURL(new RegExp(`/en/owner/${merchant.slug}`));
  return link;
}
