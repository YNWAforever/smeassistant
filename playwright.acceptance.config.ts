import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/acceptance", fullyParallel: false, workers: 1,
  timeout: 180000, expect: { timeout: 15000 }, reporter: "line",
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
