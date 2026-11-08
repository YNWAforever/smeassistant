import { expect, type Page, type Request } from "@playwright/test";

import { assertLocalOrigin } from "./safety";

/** Called only with the app origin from the owned database/Auth fixture factory. */
export function workspaceReadTarget(origin: string, current: string, target: string): string | null {
  try {
    const app = assertLocalOrigin(origin);
    const before = new URL(current);
    if (before.origin !== app || before.username || before.password) return null;
    const url = new URL(target, app);
    if (url.origin !== app || url.username || url.password ||
      !/^\/(?:en|zh-HK|zh-TW)\/owner\/acceptance-(?:hk|tw)-[a-f0-9]{8}(?:\/|$)/.test(url.pathname)) return null;
    // Auth links/callbacks and all APIs are outside the document path above.
    // Only known read filters may be preloaded, never one-use Auth query data.
    if ([...url.searchParams.keys()].some(key => !["view", "location", "cursor", "mode", "open"].includes(key))) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

type Readiness = { touch(): void; wait(): Promise<void> };
const observed = new WeakMap<Page, Readiness>();

/**
 * Unlike a previously-fired load-state, this watches current reads across
 * client-side redirects. No payloads, credentials or HMR messages are stored.
 */
export function observePageReads(page: Page): Readiness {
  const existing = observed.get(page);
  if (existing) return existing;
  const pending = new Set<Request>();
  let activity = Date.now();
  const touch = () => { activity = Date.now(); };
  const start = (request: Request) => {
    if (["GET", "HEAD"].includes(request.method()) && request.resourceType() !== "websocket") {
      pending.add(request);
      touch();
    }
  };
  const finish = (request: Request) => {
    if (pending.delete(request)) touch();
  };
  // Use the public event API; HMR continues to connect and apply updates.
  page.on("websocket", ws => {
    if (new URL(ws.url()).pathname === "/_next/webpack-hmr") ws.on("framereceived", touch);
  });
  page.on("request", start);
  page.on("requestfinished", finish);
  page.on("requestfailed", finish);
  const readiness = {
    touch,
    async wait() {
      await expect.poll(() => pending.size === 0 && Date.now() - activity >= 500,
        { timeout: 30_000, message: "Owned WebKit page reads and HMR must settle before full navigation" }).toBe(true);
    },
  };
  observed.set(page, readiness);
  page.once("close", () => {
    page.off("request", start);
    page.off("requestfinished", finish);
    page.off("requestfailed", finish);
    observed.delete(page);
  });
  return readiness;
}

/**
 * Compile only a same-origin synthetic workspace GET while the current dev
 * document can still receive HMR. The following browser goto/reload remains a
 * real full navigation; this read is never an acceptance assertion.
 */
export async function prepareFixtureDocument(page: Page, origin: string, target: string): Promise<void> {
  const href = workspaceReadTarget(origin, page.url(), target);
  if (!href) return;
  const response = await page.request.get(href);
  try {
    await response.body();
    if (response.status() >= 500) {
      throw new Error(`fixture_document_precompile_failed:${response.status()}:${new URL(href).pathname}`);
    }
  } finally { await response.dispose(); }
  const reads = observePageReads(page);
  reads.touch();
  await reads.wait();
}
