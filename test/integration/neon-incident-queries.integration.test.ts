import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { parseIncidentQueries } from "../../lib/ops/incident-queries";

const FILE = fileURLToPath(new URL("../../docs/implementation/owner-platform-v1/rollout/incident-queries.sql", import.meta.url));

const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool, getDatabase: () => drizzle(ports.pool!) }));

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon incident runbook queries (P3.5d)", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 12 });
    ports.pool = runtime;
  });
  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runtime.query("DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM scan_schedules; DELETE FROM app_users");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  const blocks = () => parseIncidentQueries(readFileSync(FILE, "utf8"));

  it("runs every read block inside a READ ONLY transaction", async () => {
    const client = await runtime.connect();
    try {
      for (const block of blocks().filter((b) => b.mode === "read")) {
        await client.query("BEGIN READ ONLY");
        await expect(client.query(block.sql), block.name).resolves.toBeDefined();
        await client.query("ROLLBACK");
      }
    } finally {
      client.release();
    }
  });

  it("round-trips the schedule pause: exactly the paused ids come back to monthly", async () => {
    const byName = Object.fromEntries(blocks().map((b) => [b.name, b.sql]));
    const user = (await runtime.query("INSERT INTO app_users(email) VALUES('runbook@example.test') RETURNING id")).rows[0].id;
    const insert = (place: string, cadence: string) =>
      runtime.query("INSERT INTO scan_schedules(place_id,input_snapshot,cadence,anniversary_day,next_run_at,created_by) VALUES($1,'{}',$2,1,now(),$3) RETURNING id", [place, cadence, user]);
    await insert("place-a", "monthly");
    await insert("place-b", "monthly");
    const already = (await insert("place-c", "paused")).rows[0].id;
    const paused = (await runtime.query(byName.pause_all_schedules)).rows.map((r) => r.id);
    expect(paused).toHaveLength(2);
    const resumed = (await runtime.query(byName.resume_schedules.replace("__SCHEDULE_IDS__", `{${paused.join(",")}}`))).rows.map((r) => r.id);
    expect(new Set(resumed)).toEqual(new Set(paused));
    const states = (await runtime.query("SELECT id, cadence FROM scan_schedules")).rows;
    expect(states.filter((r) => r.cadence === "monthly")).toHaveLength(2);
    expect(states.find((r) => r.id === already).cadence).toBe("paused");
  });
});
