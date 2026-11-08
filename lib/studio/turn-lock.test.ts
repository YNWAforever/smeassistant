import { describe, expect, it, vi } from "vitest";
import { acquireStudioTurnLock, STUDIO_TURN_LOCK_NAMESPACE, type StudioLockClient } from "./turn-lock";

/**
 * The per-conversation turn lock (design §6 "Concurrency"). The client is a
 * fake: no Postgres. The assertions are the contract the route relies on —
 * try-lock, one dedicated client, idempotent unlock in finally.
 */

function clientFor(locked: boolean): { client: StudioLockClient; queries: Array<{ sql: string; params?: readonly unknown[] }>; released: () => number } {
  const queries: Array<{ sql: string; params?: readonly unknown[] }> = [];
  let releases = 0;
  const client: StudioLockClient = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked }] };
      if (sql.includes("pg_advisory_unlock")) return { rows: [{ released: true }] };
      return { rows: [] };
    },
    release: () => { releases += 1; },
  };
  return { client, queries, released: () => releases };
}

describe("acquireStudioTurnLock", () => {
  it("takes the conversation's advisory lock on a dedicated client and releases it once", async () => {
    const { client, queries, released } = clientFor(true);
    const pool = { connect: vi.fn(async () => client) };
    const release = await acquireStudioTurnLock("conversation-1", { pool });
    expect(release).not.toBeNull();
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(queries[0]).toEqual({
      sql: "SELECT pg_try_advisory_lock($1::int, hashtext($2)::int) AS locked",
      params: [STUDIO_TURN_LOCK_NAMESPACE, "conversation-1"],
    });
    await release!();
    await release!();
    expect(queries.filter((query) => query.sql.includes("pg_advisory_unlock"))).toHaveLength(1);
    expect(released()).toBe(1);
  });

  it("returns null and releases the client when another turn already holds the lock", async () => {
    const { client, queries, released } = clientFor(false);
    const pool = { connect: async () => client };
    await expect(acquireStudioTurnLock("conversation-1", { pool })).resolves.toBeNull();
    expect(queries.some((query) => query.sql.includes("pg_advisory_unlock"))).toBe(false);
    expect(released()).toBe(1);
  });

  it("throws and releases the client when the lock query fails", async () => {
    let releases = 0;
    const client: StudioLockClient = {
      query: async () => { throw new Error("connection reset"); },
      release: () => { releases += 1; },
    };
    await expect(acquireStudioTurnLock("conversation-1", { pool: { connect: async () => client } })).rejects.toThrow("connection reset");
    expect(releases).toBe(1);
  });

  it("throws when the pool cannot provide a connection (the route maps this to 503, not busy)", async () => {
    await expect(acquireStudioTurnLock("conversation-1", { pool: { connect: async () => { throw new Error("pool exhausted"); } } })).rejects.toThrow("pool exhausted");
  });

  it("keys different conversations independently", async () => {
    const first = clientFor(true);
    const second = clientFor(true);
    const pool = { connect: vi.fn().mockResolvedValueOnce(first.client).mockResolvedValueOnce(second.client) };
    const releaseA = await acquireStudioTurnLock("conversation-a", { pool });
    const releaseB = await acquireStudioTurnLock("conversation-b", { pool });
    expect(first.queries[0].params).toEqual([STUDIO_TURN_LOCK_NAMESPACE, "conversation-a"]);
    expect(second.queries[0].params).toEqual([STUDIO_TURN_LOCK_NAMESPACE, "conversation-b"]);
    await releaseA!();
    await releaseB!();
  });
});
