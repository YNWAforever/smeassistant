import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The Vercel project runs on the Hobby plan, which permits a cron job to fire
 * only once per day. A sub-daily cron in vercel.json is rejected at deploy time,
 * before any build runs, and surfaces as a bare "Deployment failed" with no log.
 * Scheduling belongs to the Cloudflare scheduler (see CLAUDE.md), so vercel.json
 * must stay free of cron registrations. Nothing else in the repo reads that file;
 * this test is its only reader.
 */
const vercelConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL("../vercel.json", import.meta.url)), "utf8"),
) as { crons?: { path: string; schedule: string }[] };

describe("cron registration", () => {
  it("keeps vercel.json free of cron jobs", () => {
    expect(vercelConfig.crons ?? []).toEqual([]);
  });
});
