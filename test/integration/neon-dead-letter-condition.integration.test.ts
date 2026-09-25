import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { CLAIMABLE_JOB_CONDITION_SQL, DEAD_LETTERED_JOB_CONDITION_SQL } from "../../lib/scan/claimable";

describe.runIf(process.env.NEON_INTEGRATION === "1")("dead-letter condition", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    await applyMigrations(owner);
  });
  beforeEach(async () => {
    await owner.query("DELETE FROM audit_jobs");
  });
  afterAll(async () => {
    await owner?.end();
    fixture?.stop();
  });

  it("puts every stale in-flight job in exactly one of claimable and dead-lettered, and nothing else in dead-lettered", async () => {
    const statuses = ["queued", "collecting", "scoring", "persisting", "done", "partial", "failed"];
    const attempts = [0, 1, 2, 3, 4];
    const ages = ["5 minutes", "31 minutes", null];
    for (const status of statuses)
      for (const count of attempts)
        for (const age of ages)
          await owner.query(
            "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at) VALUES('Grid',$1,$2,CASE WHEN $3::text IS NULL THEN NULL ELSE now()-$3::interval END)",
            [status, count, age],
          );
    const rows = (
      await owner.query<{ status: string; attempt_count: number; stale: boolean; claimable: boolean; dead: boolean }>(
        `SELECT status, attempt_count,
                (last_attempt_at IS NOT NULL AND last_attempt_at < now()-interval '30 minutes') AS stale,
                ${CLAIMABLE_JOB_CONDITION_SQL} AS claimable,
                ${DEAD_LETTERED_JOB_CONDITION_SQL} AS dead
         FROM audit_jobs`,
      )
    ).rows;
    const inFlight = new Set(["collecting", "scoring", "persisting"]);
    for (const row of rows) {
      if (inFlight.has(row.status) && row.stale) expect(Number(row.claimable) + Number(row.dead)).toBe(1);
      else expect(row.dead).toBe(false);
      if (row.dead) expect(row.attempt_count).toBeGreaterThanOrEqual(3);
    }
    expect(rows.filter((row) => row.dead)).toHaveLength(3 * 2); // 3 in-flight statuses x attempts {3,4}, stale only
  });
});
