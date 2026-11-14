import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient, QueryResult } from "pg";
import { withExecutionBudget } from "@/lib/jobs/execution-budget";
import { createStudioDeadline } from "./deadline";
import { acquireStudioTurnSession } from "./turn-session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const result = (rows: Record<string, unknown>[] = [], command = "SELECT"): QueryResult => ({ rows, command, rowCount: rows.length, oid: 0, fields: [] });
function fixture(hook?: (sql: string) => Promise<QueryResult | undefined>) {
  const order: string[] = [];
  const query = vi.fn(async (sql: string) => {
    if (!sql.startsWith("SELECT set_config")) order.push(sql);
    const overridden = await hook?.(sql);
    return overridden ?? result(sql.includes("pg_try_advisory_lock") ? [{ locked: true }] : []);
  });
  const release = vi.fn(() => { order.push("DESTROY"); });
  const client = { query, release, on: vi.fn() } as unknown as PoolClient;
  const connect = vi.fn(async () => client);
  const end = vi.fn(async () => {});
  const pool = { connect, end } as unknown as Pick<Pool, "connect" | "end">;
  return { pool, connect, end, client, release, query, order };
}
afterEach(() => vi.useRealTimers());

describe("Studio lock-owning session", () => {
  it("keeps final persistence alive after work expires and rejects later writes", async () => {
    vi.useFakeTimers();
    const deadline = createStudioDeadline();
    const f = fixture();
    const session = (await acquireStudioTurnSession("conversation", deadline, { pool: f.pool }))!;
    await vi.advanceTimersByTimeAsync(50_000);
    expect(f.release).not.toHaveBeenCalled();
    await expect(session.transaction(async client => client.query("WORK"))).rejects.toThrow("execution_budget_exhausted");
    await withExecutionBudget(deadline.finalization, () => session.transaction(async client => client.query("SAVE")));
    await session.release();
    expect(f.order.indexOf("SAVE")).toBeLessThan(f.order.indexOf("COMMIT"));
    expect(f.order.findIndex(sql => sql.includes("pg_advisory_unlock"))).toBeGreaterThan(f.order.indexOf("COMMIT"));
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    await expect(session.executor.query("LATE")).rejects.toThrow();
    expect(f.order).not.toContain("LATE");
    deadline.dispose();
  });

  it("serializes whole transactions and drains admitted work before unlocking", async () => {
    const deadline = createStudioDeadline();
    const f = fixture();
    const session = (await acquireStudioTurnSession("conversation", deadline, { pool: f.pool }))!;
    const entered = deferred<void>();
    const gate = deferred<void>();
    const first = session.transaction(async client => { entered.resolve(); await gate.promise; await client.query("FIRST"); });
    await entered.promise;
    const second = session.transaction(async client => client.query("SECOND"));
    const release = session.release();
    await expect(session.executor.query("TOO_LATE")).rejects.toThrow();
    expect(f.order.filter(sql => sql === "BEGIN")).toHaveLength(1);
    gate.resolve();
    await Promise.all([first, second, release]);
    const statements = f.order.filter(sql => !sql.includes("pg_"));
    expect(statements).toEqual(["BEGIN", "FIRST", "COMMIT", "BEGIN", "SECOND", "COMMIT", "DESTROY"]);
    expect(f.release).toHaveBeenCalledTimes(1);
    deadline.dispose();
  });

  it("destroys the session at the final cutoff even when a query ignores cancellation", async () => {
    vi.useFakeTimers();
    const held = deferred<QueryResult>();
    const entered = deferred<void>();
    const f = fixture(async sql => { if (sql === "HOLD") { entered.resolve(); return held.promise; } });
    const deadline = createStudioDeadline();
    const session = (await acquireStudioTurnSession("conversation", deadline, { pool: f.pool }))!;
    const pending = session.transaction(async client => {
      try { await client.query("HOLD"); } catch { /* Simulate a late callback that ignores cancellation. */ }
      await client.query("LATE");
    });
    const rejection = expect(pending).rejects.toThrow();
    await entered.promise;
    await vi.advanceTimersByTimeAsync(55_000);
    await rejection;
    held.resolve(result());
    await expect(session.release()).rejects.toThrow("execution_budget_exhausted");
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.order).not.toContain("LATE");
    expect(f.order.some(sql => sql.includes("pg_advisory_unlock"))).toBe(false);
    deadline.dispose();
  });

  it("does not report a rolled-back commit as success", async () => {
    const deadline = createStudioDeadline();
    const f = fixture(async sql => sql === "COMMIT" ? result([], "ROLLBACK") : undefined);
    const session = (await acquireStudioTurnSession("conversation", deadline, { pool: f.pool }))!;
    await expect(session.transaction(async client => client.query("SAVE"))).rejects.toThrow("transaction_rolled_back");
    expect(f.order).toContain("ROLLBACK");
    await session.release();
    deadline.dispose();
  });

  it("destroys rather than reuses a session after an unknown unlock outcome", async () => {
    const deadline = createStudioDeadline();
    const f = fixture(async sql => { if (sql.includes("pg_advisory_unlock")) throw new Error("connection lost"); return undefined; });
    const session = (await acquireStudioTurnSession("conversation", deadline, { pool: f.pool }))!;
    const release = session.release();
    expect(session.release()).toBe(release);
    await expect(release).rejects.toThrow("connection lost");
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.end).toHaveBeenCalledTimes(1);
    deadline.dispose();
  });

  it("closes a busy conversation's private connection", async () => {
    const deadline = createStudioDeadline();
    const f = fixture(async sql => sql.includes("pg_try_advisory_lock") ? result([{ locked: false }]) : undefined);
    expect(await acquireStudioTurnSession("conversation", deadline, { pool: f.pool })).toBeNull();
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.end).toHaveBeenCalledTimes(1);
    deadline.dispose();
  });

  it("bounds a noncooperative lock query by the work cutoff", async () => {
    vi.useFakeTimers();
    const deadline = createStudioDeadline();
    const held = deferred<QueryResult>();
    const entered = deferred<void>();
    const f = fixture(async sql => {
      if (sql.includes("pg_try_advisory_lock")) { entered.resolve(); return held.promise; }
    });
    const pending = acquireStudioTurnSession("conversation", deadline, { pool: f.pool });
    const rejection = expect(pending).rejects.toThrow("execution_budget_exhausted");
    await entered.promise;
    await vi.advanceTimersByTimeAsync(50_000);
    await rejection;
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    held.resolve(result([{ locked: true }]));
    deadline.dispose();
  });

  it("discards a connection that arrives after acquisition has timed out", async () => {
    vi.useFakeTimers();
    const deadline = createStudioDeadline();
    const f = fixture();
    const connection = deferred<PoolClient>();
    f.connect.mockImplementation(() => connection.promise);
    const pending = acquireStudioTurnSession("conversation", deadline, { pool: f.pool });
    const rejection = expect(pending).rejects.toThrow("execution_budget_exhausted");
    await vi.advanceTimersByTimeAsync(50_000);
    await rejection;
    connection.resolve(f.client);
    await Promise.resolve();
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.query).not.toHaveBeenCalled();
    deadline.dispose();
  });
});
