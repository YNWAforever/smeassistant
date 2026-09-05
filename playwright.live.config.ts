import { defineConfig } from "@playwright/test";
if (process.env.E2E_AUTHORIZE_PAID_SEARCH !== "true" || !process.env.E2E_LIVE_ORIGIN) throw new Error("Live smoke needs explicit paid-search authorization and E2E_LIVE_ORIGIN");
export default defineConfig({ testDir: "./e2e/live", use: { baseURL: process.env.E2E_LIVE_ORIGIN }, workers: 1 });
