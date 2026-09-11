import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { collectWebsiteChecksForJob } from "./website-evidence";

/**
 * This collector is the only thing standing between a rescan and a workspace
 * whose website reads "not evaluated" forever, so what it refuses to do matters
 * as much as what it collects: no request for a public scan, none for a failed
 * one, and a refusal reported as "we did not look" rather than as an empty
 * measurement.
 */
const CHECKS = { evaluated: 15, passed: 9, results: [] };

function database(row: Record<string, unknown> | null) {
  const query = vi.fn(async () => ({ rows: row ? [row] : [] }));
  return { db: { query } as unknown as Pick<Pool, "query">, query };
}

const job = (over: Record<string, unknown> = {}) => ({
  workspace_id: "ws",
  status: "done",
  website_url: null,
  input_snapshot: null,
  raw_data: null,
  ...over,
});

describe("collectWebsiteChecksForJob", () => {
  it("collects for a finished workspace job, resolving the URL from any of the three places it is recorded", async () => {
    for (const [label, row] of [
      ["column", job({ website_url: "https://shop.example" })],
      ["input snapshot", job({ input_snapshot: { version: 2, websiteUrl: "https://shop.example" } })],
      ["raw evidence", job({ raw_data: { aeo: { website: { url: "https://shop.example" } } } })],
    ] as const) {
      const run = vi.fn(async () => CHECKS);
      const { db } = database(row);
      await expect(collectWebsiteChecksForJob(db, "job", run), label).resolves.toEqual(CHECKS);
      expect(run, label).toHaveBeenCalledWith("https://shop.example");
    }
  });

  it("keeps a partial scan measurable", async () => {
    const run = vi.fn(async () => CHECKS);
    const { db } = database(job({ status: "partial", website_url: "https://shop.example" }));
    await expect(collectWebsiteChecksForJob(db, "job", run)).resolves.toEqual(CHECKS);
  });

  it("spends no request on a public scan, a failed scan, an unknown job or a merchant with no website", async () => {
    for (const [label, row] of [
      ["public scan", job({ workspace_id: null, website_url: "https://shop.example" })],
      ["failed scan", job({ status: "failed", website_url: "https://shop.example" })],
      ["still collecting", job({ status: "collecting", website_url: "https://shop.example" })],
      ["no website", job()],
      ["no such job", null],
    ] as const) {
      const run = vi.fn(async () => CHECKS);
      const { db } = database(row);
      await expect(collectWebsiteChecksForJob(db, "job", run), label).resolves.toBeNull();
      expect(run, label).not.toHaveBeenCalled();
    }
  });

  it("reports a lookup or fetch failure as 'we did not look', never as an empty measurement", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const broken = { query: vi.fn(async () => { throw new Error("database unavailable"); }) } as unknown as Pick<Pool, "query">;
      await expect(collectWebsiteChecksForJob(broken, "job")).resolves.toBeNull();

      // Distinct from `runWebsiteChecks` returning `evaluated: 0`: that value
      // means we reached a site and read nothing usable, which the snapshot is
      // entitled to record as unreachable. A throw means we never found out.
      const { db } = database(job({ website_url: "https://shop.example" }));
      const throws = vi.fn(async () => { throw new Error("socket hang up"); });
      await expect(collectWebsiteChecksForJob(db, "job", throws)).resolves.toBeNull();
      expect(log).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenLastCalledWith(
        "[workspace/website-evidence] website checks could not be collected",
        { category: "website_checks_uncollected", jobId: "job" },
      );
    } finally {
      log.mockRestore();
    }
  });
});
