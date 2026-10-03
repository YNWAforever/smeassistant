import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

// Repositories must use the pool they are given; the default database is never reached.
vi.mock("../../lib/db/client", () => ({
  getPool: () => {
    throw new Error("default_database_forbidden");
  },
}));

import { artifactRepository } from "../../lib/repositories/artifacts";

// P4.3 read-only signal queries (docs/superpowers/specs/2026-10-03-contextual-assistant-design.md section 4).
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon assistant signal reads", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query(
      "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
    );
    await applyMigrations(owner, await loadMigrations());
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 5 });
  });

  beforeEach(async () => {
    await runtime.query("DELETE FROM workspaces; DELETE FROM app_users");
  });

  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  const repo = () => artifactRepository(runtime);

  async function workspace(): Promise<string> {
    return (
      await runtime.query("INSERT INTO workspaces(slug,market,timezone) VALUES($1,'hk','Asia/Hong_Kong') RETURNING id", [`ws-${randomUUID().slice(0, 8)}`])
    ).rows[0].id as string;
  }

  async function location(workspaceId: string): Promise<string> {
    const slug = `loc-${randomUUID().slice(0, 8)}`;
    return (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,$2,$2) RETURNING id", [workspaceId, slug])).rows[0].id as string;
  }

  async function action(workspaceId: string, locationId: string | null, state = "recommended"): Promise<string> {
    return (
      await runtime.query(
        `INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state)
         VALUES($1,$2,'review-response','{}','{}','{}','low',0,'[]',5,'Live',$3,$4) RETURNING id`,
        [workspaceId, locationId, `dk-${randomUUID()}`, state],
      )
    ).rows[0].id as string;
  }

  let versionNo = 0;
  async function version(workspaceId: string, actionId: string, approvalState: string, createdAt: string): Promise<string> {
    versionNo += 1;
    return (
      await runtime.query(
        `INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type,approval_state,created_at)
         VALUES($1,$2,$3,'body','agent',$4,$5) RETURNING id`,
        [workspaceId, actionId, versionNo, approvalState, createdAt],
      )
    ).rows[0].id as string;
  }

  describe("assistantWaitingVersions", () => {
    it("returns draft and changes_requested only, oldest first, mapped to the contract shape", async () => {
      const ws = await workspace();
      const loc = await location(ws);
      const a = await action(ws, loc);
      const newer = await version(ws, a, "changes_requested", "2026-09-10T00:00:00Z");
      const older = await version(ws, a, "draft", "2026-09-01T00:00:00Z");
      await version(ws, a, "approved", "2026-09-02T00:00:00Z");
      await version(ws, a, "rejected", "2026-09-03T00:00:00Z");
      await version(ws, a, "superseded", "2026-09-04T00:00:00Z");

      const rows = await repo().assistantWaitingVersions(ws, null);
      expect(rows.map((r) => r.id)).toEqual([older, newer]);
      expect(rows[0]).toMatchObject({ id: older, action_id: a, version_no: expect.any(Number), approval_state: "draft", location_id: loc });
      expect(rows[1].approval_state).toBe("changes_requested");
      expect(typeof rows[0].created_at).toBe("string");
      expect(new Date(rows[0].created_at).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    });

    it("excludes versions on a completed, dismissed, cancelled or expired action", async () => {
      const ws = await workspace();
      const loc = await location(ws);
      const open = await action(ws, loc, "in_progress");
      const keep = await version(ws, open, "draft", "2026-09-01T00:00:00Z");
      for (const state of ["completed", "dismissed", "cancelled", "expired"]) {
        const closed = await action(ws, loc, state);
        await version(ws, closed, "draft", "2026-09-02T00:00:00Z");
      }
      expect((await repo().assistantWaitingVersions(ws, null)).map((r) => r.id)).toEqual([keep]);
    });

    it("excludes another workspace's versions", async () => {
      const ws = await workspace();
      const other = await workspace();
      const mine = await version(ws, await action(ws, null), "draft", "2026-09-01T00:00:00Z");
      await version(other, await action(other, null), "draft", "2026-09-01T00:00:00Z");
      expect((await repo().assistantWaitingVersions(ws, null)).map((r) => r.id)).toEqual([mine]);
    });

    it("filters to a location but keeps workspace-wide actions", async () => {
      const ws = await workspace();
      const l1 = await location(ws);
      const l2 = await location(ws);
      const at1 = await version(ws, await action(ws, l1), "draft", "2026-09-01T00:00:00Z");
      const at2 = await version(ws, await action(ws, l2), "draft", "2026-09-02T00:00:00Z");
      const wide = await version(ws, await action(ws, null), "draft", "2026-09-03T00:00:00Z");

      expect((await repo().assistantWaitingVersions(ws, l1)).map((r) => r.id)).toEqual([at1, wide]);
      expect((await repo().assistantWaitingVersions(ws, l2)).map((r) => r.id)).toEqual([at2, wide]);
      expect((await repo().assistantWaitingVersions(ws, null)).map((r) => r.id)).toEqual([at1, at2, wide]);
    });

    it("returns at most 20, ordered by created_at then id", async () => {
      const ws = await workspace();
      const a = await action(ws, null);
      for (let i = 0; i < 22; i++) await version(ws, a, "draft", `2026-09-01T00:00:${String(i).padStart(2, "0")}Z`);
      const rows = await repo().assistantWaitingVersions(ws, null);
      expect(rows).toHaveLength(20);
      const times = rows.map((r) => Date.parse(r.created_at));
      expect(times).toEqual([...times].sort((x, y) => x - y));
    });
  });

  describe("assistantGoogleConnection", () => {
    const connect = (ws: string, provider: string, status: string, connectedAt: string) =>
      runtime.query(
        "INSERT INTO oauth_connections(workspace_id,provider,access_token_encrypted,status,connected_at) VALUES($1,$2,'fixture',$3,$4)",
        [ws, provider, status, connectedAt],
      );

    it("returns null when there is no google_gbp row", async () => {
      const ws = await workspace();
      expect(await repo().assistantGoogleConnection(ws)).toBeNull();
      await connect(ws, "instagram", "active", "2026-09-01T00:00:00Z");
      expect(await repo().assistantGoogleConnection(ws)).toBeNull();
    });

    it("returns the newest google_gbp row's status", async () => {
      const ws = await workspace();
      await connect(ws, "google_gbp", "active", "2026-08-01T00:00:00Z");
      await connect(ws, "google_gbp", "expired", "2026-09-01T00:00:00Z");
      expect(await repo().assistantGoogleConnection(ws)).toEqual({ status: "expired" });
    });

    it("does not read another workspace's connection", async () => {
      const ws = await workspace();
      const other = await workspace();
      await connect(other, "google_gbp", "active", "2026-09-01T00:00:00Z");
      expect(await repo().assistantGoogleConnection(ws)).toBeNull();
    });
  });
});
