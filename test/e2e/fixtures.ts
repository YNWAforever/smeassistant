import { test as base, expect, type Page } from "@playwright/test";
import { startEnvironment, type AcceptanceEnvironment } from "./environment";
import { seedMerchant, type MerchantSeed } from "./seed";
export const test = base.extend<{ merchant: MerchantSeed }, { environment: AcceptanceEnvironment }>({
  environment: [async ({}, runFixture) => { const env = await startEnvironment(); try { await runFixture(env); } finally { await env.stop(); } }, { scope: "worker", timeout: 240000 }],
  context: async ({ context }, runFixture) => {
    await context.route('**/*', route => {
      const url=new URL(route.request().url());
      return ['localhost','127.0.0.1','[::1]'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient');
    });
    await runFixture(context);
  },
  // Every full page load waits for React to hydrate before the test acts (components/hydration-marker.tsx).
  page: async ({ page }, runFixture) => {
    const goto = page.goto.bind(page);
    page.goto = (async (url: string, options?: Parameters<Page["goto"]>[1]) => {
      const response = await goto(url, options);
      if (response?.headers()["content-type"]?.includes("text/html")) await waitForHydration(page);
      return response;
    }) as Page["goto"];
    await runFixture(page);
  },
  baseURL: async ({ environment }, runFixture) => runFixture(environment.app),
  merchant: async ({ environment }, runFixture) => runFixture(await seedMerchant(environment, "hk")),
});
export { expect };

/**
 * Wait until the root layout's HydrationMarker has run. Under `next dev` hydration can lag the `load`
 * event by seconds; acting earlier clicks or types on server-rendered HTML, which turns a `<Link>`
 * into a full navigation and lets React wipe typed input.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 30_000 });
}
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
    link = links.find((value) => value.startsWith(`${env.app}/api/auth/verify?`)) ?? "";
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
