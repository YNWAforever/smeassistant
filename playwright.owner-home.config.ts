import { defineConfig, devices } from "@playwright/test";
/** Mock session and in-memory HTTP only; no DB/Auth acceptance factory. */
export default defineConfig({
  testDir: "./test/offline", testMatch: "owner-home.spec.ts",
  workers: 1, retries: 0, timeout: 60_000, reporter: "line",
  outputDir: "./test-results/owner-home-next-step-20261019/browser",
  use: {
    ...devices["Desktop Chrome"], trace: "off", video: "off", screenshot: "off",
    launchOptions: { args: ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=localhost;127.0.0.1;[::1]"] },
  },
});
