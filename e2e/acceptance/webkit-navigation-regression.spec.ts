import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { devices, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

import { test, expect, signIn, waitForPageReady } from "../../test/e2e/fixtures";
import type { AcceptanceEnvironment } from "../../test/e2e/environment";
import type { MerchantSeed } from "../../test/e2e/seed";
import { listen } from "../../test/e2e/safety";
import { prepareFixtureDocument } from "../../test/e2e/page-readiness";

async function checkNavigation(page: Page, environment: AcceptanceEnvironment, merchant: MerchantSeed,
  browser: Browser, info: TestInfo, native = false) {
  const started = Date.now();
  const events: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const pending: Promise<void>[] = [];
  const path = (value: string) => {
    try { return new URL(value, environment.app).pathname; } catch { return "[redacted]"; }
  };
  const redact = (value: string) => value.replace(/https?:\/\/[^\s"'()<>]+/g, url => path(url))
    .replace(/\?[^\s"'()<>]*/g, "?[redacted]");
  const record = (value: Record<string, unknown>) => events.push({ ms: Date.now() - started, ...value });
  page.on("pageerror", error => {
    const message = redact(error.message);
    errors.push(message);
    record({ kind: "pageerror", message, stack: redact(error.stack ?? "").split("\n").slice(0, 8) });
  });
  page.on("requestfailed", request => {
    record({ kind: "requestfailed", path: path(request.url()), type: request.resourceType(),
      navigation: request.isNavigationRequest(), failure: redact(request.failure()?.errorText ?? "unknown") });
  });
  page.on("request", request => {
    if (request.isNavigationRequest() || request.resourceType() === "fetch") {
      record({ kind: "request", path: path(request.url()), method: request.method(), type: request.resourceType() });
    }
  });
  page.on("response", response => {
    const request = response.request();
    if (!request.isNavigationRequest() && request.resourceType() !== "fetch") return;
    pending.push((async () => {
      record({ kind: "response", path: path(response.url()), status: response.status(),
        contentType: await response.headerValue("content-type"),
        encoding: await response.headerValue("content-encoding"),
        transfer: await response.headerValue("transfer-encoding"),
        corsOrigin: await response.headerValue("access-control-allow-origin") });
    })());
  });
  page.on("websocket", socket => socket.on("framesent", frame => {
    try {
      const value = JSON.parse(String(frame.payload)) as Record<string, unknown>;
      if (value.event === "client-full-reload") {
        record({ kind: "hmr_reload", runtimeError: value.hadRuntimeError === true,
          stack: typeof value.stackTrace === "string" ? redact(value.stackTrace) : null });
      }
    } catch { /* No non-JSON frame or unrelated protocol payload is retained. */ }
  }));
  try {
    await signIn(page, environment, merchant);
    await waitForPageReady(page);
    record({ kind: "authenticated_home" });
    const action = `/en/owner/${merchant.slug}/actions/${merchant.actionId}`;
    if (native) await prepareFixtureDocument(page, environment.app, action);
    expect((await page.goto(action))?.status()).toBe(200);
    await waitForPageReady(page);
    await expect(page.locator(".action-detail-page")).toBeVisible();
    if (native) await prepareFixtureDocument(page, environment.app, page.url());
    expect((await page.reload())?.status()).toBe(200);
    await waitForPageReady(page);
    await expect(page.locator(".action-detail-page")).toBeVisible();
    expect(errors).toEqual([]);
    expect(events.filter(event => event.kind === "hmr_reload")).toEqual([]);
  } finally {
    await Promise.allSettled(pending);
    writeFileSync(info.outputPath("navigation.json"), JSON.stringify({
      layer: "Owned synthetic local DB/Auth fixtures; no credentials, bodies or Auth query strings captured",
      browser: browser.browserType().name(), version: browser.version(), events,
    }, null, 2));
  }
}

test("an authenticated fixture can navigate to an action and reload without fetch or hydration failures", async ({
  page, environment, merchant, browser,
}, info) => checkNavigation(page, environment, merchant, browser, info));

test("native HTTP behind a rejecting proxy preserves authenticated action navigation", async ({
  browser, environment, merchant,
}, info) => {
  let rejected = 0;
  const proxy = createServer((_req, res) => { rejected++; res.writeHead(403).end("Local fixture egress denied"); });
  proxy.on("connect", (_req, socket) => { rejected++; socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); });
  const proxyOrigin = await listen(proxy);
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({
      ...(browser.browserType().name() === "webkit" ? devices["iPhone 14"] : devices["Desktop Chrome"]),
      baseURL: environment.app, viewport: { width: 390, height: 844 },
      proxy: { server: proxyOrigin, bypass: "localhost,127.0.0.1,[::1]" },
    });
    const page = await context.newPage();
    expect((await page.goto("http://blocked.invalid/fixture-egress-probe"))?.status()).toBe(403);
    expect(rejected).toBe(1);
    await checkNavigation(page, environment, merchant, browser, info, true);
  } finally {
    try { await context?.close(); } finally {
      proxy.closeAllConnections();
      await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
    }
  }
});
