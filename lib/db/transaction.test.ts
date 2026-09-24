import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("./client", () => ({
  getPool: () => ({ connect: mocks.connect }),
}));

import { withTransaction } from "./transaction";

describe("withTransaction", () => {
  const query = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue({ query, release });
  });

  it("uses an explicitly supplied pool without opening the default pool", async () => {
    const suppliedQuery = vi.fn().mockResolvedValue({ rows: [] });
    const suppliedRelease = vi.fn();
    const suppliedClient = { query: suppliedQuery, release: suppliedRelease };
    const suppliedPool = { connect: vi.fn().mockResolvedValue(suppliedClient) };
    const result = await withTransaction(async client => {
      expect(client).toBe(suppliedClient);
      await client.query("SELECT 1");
      return "supplied";
    }, suppliedPool as never);
    expect(result).toBe("supplied");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(suppliedQuery.mock.calls.map(call => call[0])).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
    expect(suppliedRelease).toHaveBeenCalledOnce();
  });

  it("preserves a BEGIN failure after a successful rollback attempt", async () => {
    const primaryError = new Error("begin_failed");
    query.mockRejectedValueOnce(primaryError).mockResolvedValueOnce({ rows: [] });

    await expect(withTransaction(vi.fn())).rejects.toBe(primaryError);

    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(2, "ROLLBACK");
    expect(release).toHaveBeenCalledWith();
  });

  // COMMIT on an aborted transaction resolves with the tag ROLLBACK instead of
  // raising. withTransaction must treat that as the failure it is.
  it("rejects when COMMIT reports that the transaction was rolled back", async () => {
    const suppliedQuery = vi.fn(async (sql: string) =>
      sql === "COMMIT" ? { command: "ROLLBACK", rows: [] } : { command: sql, rows: [] },
    );
    const suppliedPool = { connect: vi.fn().mockResolvedValue({ query: suppliedQuery, release: vi.fn() }) };
    await expect(withTransaction(async () => "value", suppliedPool as never)).rejects.toThrow("transaction_rolled_back");
  });

  it("returns the value when COMMIT reports a commit", async () => {
    const suppliedQuery = vi.fn(async (sql: string) => ({ command: sql, rows: [] }));
    const suppliedPool = { connect: vi.fn().mockResolvedValue({ query: suppliedQuery, release: vi.fn() }) };
    await expect(withTransaction(async () => "value", suppliedPool as never)).resolves.toBe("value");
  });

  it("preserves the callback failure and destroys the client when rollback fails", async () => {
    const primaryError = new Error("callback_failed");
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("rollback_failed"));

    await expect(withTransaction(async () => { throw primaryError; })).rejects.toBe(primaryError);

    expect(query).toHaveBeenNthCalledWith(2, "ROLLBACK");
    expect(release).toHaveBeenCalledWith(true);
  });
});
