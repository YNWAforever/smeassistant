import { defineConfig, devices } from "@playwright/test";
/** Offline real-component proof; no session provider, database or paid API is reachable. */
export default defineConfig({
  testDir: "./test/offline", testMatch: "conversation.spec.ts", workers: 1, retries: 0, timeout: 45_000,
  reporter: "line", outputDir: "./test-results/conversation-stage-1",
  use: { trace: "retain-on-failure", launchOptions: { args: ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=localhost;127.0.0.1;[::1]"] } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
});
