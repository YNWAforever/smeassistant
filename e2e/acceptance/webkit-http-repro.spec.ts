import { createServer } from "node:http";

import { test, expect } from "@playwright/test";

import { listen } from "../../test/e2e/safety";

// This test owns a static loopback server only: no database, Auth or cookies.
test.use({ proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1,[::1]" } });

for (const intercepted of [true, false]) {
  test(`same-origin streaming fetch and navigation with interception ${intercepted}`, async ({ page, context }) => {
    const server = createServer((req, res) => {
      res.setHeader("cache-control", "no-store");
      if (req.url === "/data") {
        res.setHeader("content-type", "application/json");
        res.write('{"message":');
        setImmediate(() => res.end('"complete"}'));
      } else {
        res.setHeader("content-type", "text/html");
        res.end(`<html><body><h1>${req.url === "/target" ? "Target" : "Home"}</h1>
          <script>fetch("/data").then(r => r.json()).then(data => {
            document.documentElement.dataset.ready = data.message;
          });</script></body></html>`);
      }
    });
    const origin = await listen(server);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.name));
    try {
      if (intercepted) {
        await context.route("**/*", route => new URL(route.request().url()).origin === origin
          ? route.continue() : route.abort("blockedbyclient"));
      }
      expect((await page.goto(origin))?.status()).toBe(200);
      await page.waitForFunction(() => document.documentElement.dataset.ready === "complete");
      expect(await page.evaluate(async () => {
        const response = await fetch("/data", { headers: { accept: "text/x-component" } });
        return response.json();
      })).toEqual({ message: "complete" });
      expect((await page.goto(`${origin}/target`))?.status()).toBe(200);
      await page.waitForFunction(() => document.documentElement.dataset.ready === "complete");
      await expect(page.getByRole("heading", { name: "Target" })).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
