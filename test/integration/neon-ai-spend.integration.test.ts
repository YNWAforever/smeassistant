import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { artifactRepository } from "../../lib/repositories/artifacts";

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon AI spend read", () => {
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
    runtime = new Pool({ connectionString: url.href });
  });
  beforeEach(async () => {
    await runtime.query("DELETE FROM workspaces");
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  const workspace = async (slug: string) => (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [slug])).rows[0].id as string;
  const action = async (workspaceId: string) =>
    (await runtime.query(
      "INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key) VALUES($1,'review-response','{}','{}','[]','low',1,'{}',5,'Live',$2) RETURNING id",
      [workspaceId, `${workspaceId}:spend`],
    )).rows[0].id as string;
  const recordRun = (workspaceId: string, actionId: string, cost: number | null, age = "1 hour") =>
    runtime.query(
      "INSERT INTO action_runs(workspace_id,action_id,agent_key,state,cost_usd,created_at) VALUES($1,$2,'review_reply','succeeded',$3,now()-$4::interval)",
      [workspaceId, actionId, cost, age],
    );

  it("sums recorded cost in the last 24 hours, globally and for one workspace", async () => {
    const mine = await workspace("spend-mine");
    const other = await workspace("spend-other");
    const a = await action(mine);
    const b = await action(other);
    await recordRun(mine, a, 5);
    await recordRun(mine, a, 100, "25 hours");
    await recordRun(mine, a, null);
    await recordRun(other, b, 3);
    expect(await artifactRepository(runtime).aiSpend24h(mine)).toEqual({ globalUsd: 8, workspaceUsd: 5 });
    expect(await artifactRepository(runtime).aiSpend24h(other)).toEqual({ globalUsd: 8, workspaceUsd: 3 });
  });

  it("reads zero, not nothing, when no run is recorded", async () => {
    expect(await artifactRepository(runtime).aiSpend24h(await workspace("spend-empty"))).toEqual({ globalUsd: 0, workspaceUsd: 0 });
  });

  it("fails rather than answering when the read cannot run", async () => {
    const closed = new Pool({ connectionString: fixture.databaseUrl });
    await closed.end();
    await expect(artifactRepository(closed).aiSpend24h(await workspace("spend-closed"))).rejects.toThrow("artifact_operation_failed");
  });
});
