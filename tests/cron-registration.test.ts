import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * No Vercel Cron is registered (owner decision 2026-10-04, DEC-10 default "no
 * hosted cron activation"). `/api/cron/dispatch` had been registered every five
 * minutes since the 2026-09-13 scheduler design
 * (docs/superpowers/specs/2026-09-13-scan-scheduler-trigger-design.md), but in
 * production every invocation was refused with 401, so nothing ran
 * (docs/implementation/owner-platform-v1/RELEASE-EVIDENCE-080ddf6.md). Fixing the
 * secret would have switched on unsupervised provider spend, so the entry was
 * removed instead. The route stays in the code, unscheduled.
 *
 * This test fails loudly if any cron is added back. Re-enabling the scheduler
 * needs a recorded DEC-10 decision (schedule, budget, pause policy) and a valid
 * CRON_SECRET of at least 16 characters, and then this expectation changes in
 * the same PR.
 */
const vercelConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL("../vercel.json", import.meta.url)), "utf8"),
) as { crons?: { path: string; schedule: string }[] };

describe("cron registration", () => {
  it("registers no cron at all", () => {
    expect(vercelConfig.crons ?? []).toEqual([]);
  });
});
