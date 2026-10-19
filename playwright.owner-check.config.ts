import { defineConfig, devices } from "@playwright/test";

/** Offline component/HTTP fixture only; never imports the DB/Auth acceptance factory. */
export default defineConfig({
  testDir: "./test/offline",
  testMatch: "owner-review-check.spec.ts",
  workers: 1, retries: 0, timeout: 45_000,
  outputDir: "./test-results/owner-review-check-20261019/browser",
  reporter: "line",
  use: { ...devices["Desktop Chrome"], trace: "off", video: "off", screenshot: "off",
    launchOptions: { args: ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=localhost;127.0.0.1;[::1]"] } },
});
