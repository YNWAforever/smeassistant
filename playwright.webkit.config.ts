import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --require=${fileURLToPath(new URL("./test/e2e/transport-guard.cjs", import.meta.url))}`;

/** Opt-in owned-fixture regression; no hosted session or credential storage. */
export default defineConfig({
  testDir: "./e2e/acceptance",
  outputDir: "./test-results/webkit-acceptance",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: { trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=localhost;127.0.0.1;[::1]"] },
      },
    },
  ],
});
