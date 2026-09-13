import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

const connect = vi.fn();
const poolQuery = vi.fn();
vi.mock("../db/client", () => ({ getPool: () => ({ query: poolQuery, connect }) }));

import { claimsRepository } from "./claims";

/** A fake transaction client: the thing a caller would hand in. */
function fakeClient() {
  const query = vi.fn(async (sql: string) => {
    if (/INSERT INTO workspaces/.test(sql)) return { rows: [{ id: "ws-1", slug: "kam-man-house" }], rowCount: 1 };
    if (/SELECT slug FROM workspaces/.test(sql)) return { rows: [], rowCount: 0 };
    if (/UPDATE audit_jobs/.test(sql)) return { rows: [{ id: "job-1" }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { query, executor: { query } as unknown as Pick<Pool, "query"> };
}

describe("claimsRepository executor awareness", () => {
  it("runs createWorkspaceWithOwner on a supplied client, opening no transaction of its own", async () => {
    const client = fakeClient();
    const result = await claimsRepository.createWorkspaceWithOwner(
      { ownerUserId: "u1", ownerEmail: "o@example.test", businessName: "Kam Man House", industry: null, district: null, market: "hk" },
      client.executor,
    );
    expect(result).toEqual({ id: "ws-1", slug: "kam-man-house" });
    // The caller owns BEGIN/COMMIT: this must not check out its own connection.
    expect(connect).not.toHaveBeenCalled();
    expect(poolQuery).not.toHaveBeenCalled();
    // The advisory lock still runs, now scoped to the CALLER's transaction.
    expect(client.query.mock.calls.some(([sql]) => /pg_advisory_xact_lock/.test(String(sql)))).toBe(true);
  });

  it("runs attachJob on a supplied client", async () => {
    const client = fakeClient();
    expect(await claimsRepository.attachJob("job-1", "ws-1", client.executor)).toBe(true);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE audit_jobs"), ["job-1", "ws-1"]);
  });

  it("still uses the pool when no client is supplied", async () => {
    poolQuery.mockResolvedValue({ rows: [{ id: "job-1" }], rowCount: 1 });
    expect(await claimsRepository.attachJob("job-1", "ws-1")).toBe(true);
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });
});
