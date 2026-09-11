import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { REAP_STALE_ACTION_RUNS_SQL, actionRunReaperRepository } from "./action-run-reaper";

/** pg's `query` is heavily overloaded; the repository only ever uses the (text, values) form. */
const executor = (rows: { run_id: string }[] = []) => {
  const query = vi.fn(async () => ({ rows }));
  return { client: { query } as unknown as Pick<Pool, "query">, query };
};

describe("actionRunReaperRepository", () => {
  it("issues no query at all when there is nothing to reap", async () => {
    const { client, query } = executor();
    expect(await actionRunReaperRepository(client).reapStale("ws-1", [], 180_000)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("binds exactly the workspace, action ids and threshold, and returns the reaped ids", async () => {
    const { client, query } = executor([{ run_id: "run-1" }, { run_id: "run-2" }]);
    const reaped = await actionRunReaperRepository(client).reapStale("ws-1", ["act-1", "act-2"], 180_000);
    expect(reaped).toEqual(["run-1", "run-2"]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(REAP_STALE_ACTION_RUNS_SQL, ["ws-1", ["act-1", "act-2"], 180_000]);
  });
});

describe("REAP_STALE_ACTION_RUNS_SQL", () => {
  it("locks the candidate rows so concurrent reapers take disjoint sets", () => {
    // AS MATERIALIZED is load-bearing: the CTE is non-DML and referenced once,
    // so PostgreSQL 12+ would otherwise be free to inline it and dissolve the
    // locking step the concurrency guarantee rests on.
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain("WITH stale AS MATERIALIZED (");
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain("FOR UPDATE OF r SKIP LOCKED");
  });

  it("only reaps runs whose own workspace matches and whose location is in scope", () => {
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain("r.workspace_id = $1");
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain("JOIN actions a ON a.id = r.action_id AND a.workspace_id = r.workspace_id");
    // Mirrors ACTION_SCOPE_PREDICATE, so the audit row can never carry a location
    // belonging to another workspace.
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain(
      "AND (a.location_id IS NULL OR EXISTS (SELECT 1 FROM locations l WHERE l.id = a.location_id AND l.workspace_id = a.workspace_id))",
    );
  });

  it("transitions only non-terminal runs and uses the database clock", () => {
    expect(REAP_STALE_ACTION_RUNS_SQL.match(/state IN \('queued','running'\)/g)).toHaveLength(2);
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain("SET state = 'timed_out', finished_at = now()");
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain("COALESCE(r.started_at, r.created_at)");
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain("now() - ($3::double precision * interval '1 millisecond')");
  });

  it("writes a system-attributed audit row and never leaves an untyped NULL in the payload", () => {
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain("'system', NULL::uuid, 'run.timed_out', 'action_run'");
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain("'locale', NULL::text");
    expect(REAP_STALE_ACTION_RUNS_SQL).toContain("'reason', 'action_run_reaped'");
  });

  it("cannot move an action's lifecycle", () => {
    // queue()/start() never write action_state -- only finish() does -- so a
    // stranded run leaves `actions` untouched and there is nothing to reconcile.
    // This also keeps the reaper entirely clear of completion_fence_actions.
    expect(REAP_STALE_ACTION_RUNS_SQL).not.toContain("UPDATE actions");
    expect(REAP_STALE_ACTION_RUNS_SQL).not.toContain("action_state");
  });
});
