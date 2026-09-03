import { defineConfig, devices } from "@playwright/test";

/**
 * Ported from upstream apps/web/playwright.config.ts. The funnel spec drives a
 * real `next start` on :3100 with fixture collectors (SCAN_SOURCES=fixture), so
 * no paid provider is ever called from CI (CLAUDE.md §0.1).
 *
 * Note: pnpm 9 forwards a literal "--" to `next start`, which then treats it as
 * the project directory, so the command passes the port flag directly.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: "line",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "corepack pnpm start -p 3100",
    url: "http://localhost:3100/zh-HK",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, SCAN_SOURCES: process.env.SCAN_SOURCES ?? "fixture" },
  },
});
