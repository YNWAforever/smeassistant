import { describe, expect, it, vi } from "vitest";
import { ROUTE_MAX_DURATION_MS } from "./runs";
import { RUN_STALE_AFTER_MS, reapStrandedRuns } from "./run-reaper";

describe("RUN_STALE_AFTER_MS", () => {
  it("stays clear of the window where the platform could still be running the handler", () => {
    // ROUTE_MAX_DURATION_MS mirrors `maxDuration = 60` on
    // app/api/actions/[actionId]/run/route.ts -- the platform's hard kill. A run
    // older than twice that provably has no live handler behind it, so this is
    // the invariant that stops anyone shortening the threshold into the live
    // window. It is a floor, not the value: 3 minutes keeps the owner's dead
    // Generate button short.
    expect(RUN_STALE_AFTER_MS).toBeGreaterThan(ROUTE_MAX_DURATION_MS * 2);
    expect(RUN_STALE_AFTER_MS).toBe(180_000);
  });
});

describe("reapStrandedRuns", () => {
  it("returns nothing and touches no connection when there are no action ids", async () => {
    const repository = { reapStale: vi.fn(async () => ["run-1"]) };
    expect(await reapStrandedRuns("ws-1", [], { repository })).toEqual([]);
    expect(repository.reapStale).not.toHaveBeenCalled();
  });

  it("forwards the workspace, ids and default threshold and returns the reaped ids", async () => {
    const repository = { reapStale: vi.fn(async () => ["run-1"]) };
    expect(await reapStrandedRuns("ws-1", ["act-1"], { repository })).toEqual(["run-1"]);
    expect(repository.reapStale).toHaveBeenCalledWith("ws-1", ["act-1"], RUN_STALE_AFTER_MS);
  });

  it("forwards an explicit threshold override", async () => {
    const repository = { reapStale: vi.fn(async () => []) };
    await reapStrandedRuns("ws-1", ["act-1"], { repository, staleAfterMs: 1_000 });
    expect(repository.reapStale).toHaveBeenCalledWith("ws-1", ["act-1"], 1_000);
  });

  it("swallows a repository failure so a reconciliation write cannot fail an authorized read", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const repository = { reapStale: vi.fn(async () => { throw new Error("boom"); }) };
    await expect(reapStrandedRuns("ws-1", ["act-1"], { repository })).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "[workspace/run-reaper] stale runs not reaped",
      { category: "action_run_reap_failed" },
    );
    consoleError.mockRestore();
  });
});
