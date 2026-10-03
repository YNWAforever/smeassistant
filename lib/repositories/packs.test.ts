import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { packRepository } from "./packs";

/** A database error whose message must never be logged or returned: only its SQLSTATE may be. */
function databaseError(code: string): Error {
  return Object.assign(new Error('relation "work_packs" does not exist at owner@private-host'), { code });
}

const START = { workspaceId: "ws-1", locationId: "loc-1", actorId: "user-1", locale: "en", ipHash: null };

describe("packRepository failure logging (final review G5)", () => {
  let logged: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => logged.mockRestore());

  function loggedText(): string {
    return JSON.stringify(logged.mock.calls);
  }

  it("logs a failed start with its category and SQLSTATE, and rethrows only the generic code", async () => {
    const database = { connect: vi.fn().mockRejectedValue(databaseError("08006")), query: vi.fn() };
    await expect(packRepository(database).startPack(START)).rejects.toThrow(/^pack_start_failed$/);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("[packs] start failed", { category: "pack_start_failed", code: "08006" });
    expect(loggedText()).not.toContain("does not exist");
    expect(loggedText()).not.toContain("private-host");
  });

  it("logs a failed read the same way, for each read path", async () => {
    const database = { connect: vi.fn(), query: vi.fn().mockRejectedValue(databaseError("42P01")) };
    const repo = packRepository(database);
    await expect(repo.openPack("ws-1", "loc-1")).rejects.toThrow(/^pack_read_failed$/);
    await expect(repo.getPack("pack-1")).rejects.toThrow(/^pack_read_failed$/);
    await expect(repo.packScope("pack-1")).rejects.toThrow(/^pack_read_failed$/);
    expect(logged).toHaveBeenCalledTimes(3);
    for (const call of logged.mock.calls) expect(call).toEqual(["[packs] read failed", { category: "pack_read_failed", code: "42P01" }]);
    expect(loggedText()).not.toContain("does not exist");
  });

  it("logs code unknown when the cause carries no SQLSTATE", async () => {
    const database = { connect: vi.fn(), query: vi.fn().mockRejectedValue(new TypeError("secret detail")) };
    await expect(packRepository(database).getPack("pack-1")).rejects.toThrow(/^pack_read_failed$/);
    expect(logged).toHaveBeenCalledWith("[packs] read failed", { category: "pack_read_failed", code: "unknown" });
    expect(loggedText()).not.toContain("secret detail");
  });
});
