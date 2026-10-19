import { test as base, expect, type Page } from "@playwright/test";
import { startEnvironment, type AcceptanceEnvironment } from "./environment";
import { clearMerchantActionRuns, seedMerchant, type MerchantSeed } from "./seed";
import { observePageReads, prepareFixtureDocument } from "./page-readiness";
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
  page: async ({ page, environment }, runFixture) => {
    const webkit = page.context().browser()?.browserType().name() === "webkit";
    if (webkit) observePageReads(page);
    const goto = page.goto.bind(page);
    page.goto = (async (url: string, options?: Parameters<Page["goto"]>[1]) => {
      if (webkit) await prepareFixtureDocument(page, environment.app, url);
      const response = await goto(url, options);
      if (response?.headers()["content-type"]?.includes("text/html")) await waitForPageReady(page);
      return response;
    }) as Page["goto"];
    if (webkit) {
      const reload = page.reload.bind(page);
      page.reload = (async (options?: Parameters<Page["reload"]>[0]) => {
        await prepareFixtureDocument(page, environment.app, page.url());
        const response = await reload(options);
        if (response?.headers()["content-type"]?.includes("text/html")) await waitForPageReady(page);
        return response;
      }) as Page["reload"];
    }
    await runFixture(page);
  },
  baseURL: async ({ environment }, runFixture) => runFixture(environment.app),
  merchant: async ({ environment }, runFixture) => {
    const merchant = await seedMerchant(environment, "hk");
    try {
      await runFixture(merchant);
    } finally {
      clearMerchantActionRuns(environment, merchant);
    }
  },
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

/**
 * Hydration precedes background reads; a client redirect may also retain a
 * previously-fired networkidle lifecycle state. Observe actual reads instead.
 * The existing DOM assertions, HMR and Auth guards remain active.
 */
export async function waitForPageReady(page: Page): Promise<void> {
  await waitForHydration(page);
  if (page.context().browser()?.browserType().name() === "webkit") {
    await observePageReads(page).wait();
    await waitForHydration(page);
  }
}
export async function requestSignInLink(page: Page, env: AcceptanceEnvironment, merchant: MerchantSeed, role: keyof MerchantSeed["emails"] = "owner", claim?: string) {
  // Legacy-link contract setup only. The current code-entry UI is exercised by
  // returning-sign-in.spec.ts; retain expired/reused-link regressions separately.
  const callback = new URL("/auth/callback", env.app);
  callback.searchParams.set("locale", "en");
  if (claim) callback.searchParams.set("claim", claim);
  callback.searchParams.set("returnTo", `/en/owner/${merchant.slug}`);
  callback.searchParams.set("method", "email");
  const sent = await page.request.post("/api/auth/sign-in/magic-link", {
    data: { email: merchant.emails[role], callbackURL: `${callback.pathname}${callback.search}` },
  });
  expect(sent.status()).toBe(200);
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
  if (page.context().browser()?.browserType().name() === "webkit") observePageReads(page);
  const link = await requestSignInLink(page, env, merchant, role);
  await page.goto(link);
  // In either engine a successful completion POST may precede a cold workspace
  // RSC render. Require the intended authorized workspace before asserting the
  // final URL; do not bypass completion or infer access from a successful POST.
  await expect(page.locator(".workspace-shell")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`.workspace-shell a[href="/en/owner/${merchant.slug}"]`).first())
    .toBeAttached({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`/en/owner/${merchant.slug}`));
  if (page.context().browser()?.browserType().name() === "webkit") await waitForPageReady(page);
  return link;
}
