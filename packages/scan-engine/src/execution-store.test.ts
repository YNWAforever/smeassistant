import { describe, expect, it, vi } from "vitest";
import { createScanExecution } from "./execution";
import { asClaimedJob } from "./processor";
import type { ScanExecutionStore } from "./execution-store";
const job = asClaimedJob({ id: "job", business_name: "Fixture" })!;
const unavailable = {
  status: "unavailable",
  limitationCode: "NOT_MEASURED",
} as const;
const collect = async () => ({
  ig: unavailable,
  gbp: unavailable,
  aeo: unavailable,
});
function fixture(): ScanExecutionStore {
  let claimed = false;
  return {
    claimJob: async () => {
      if (claimed) return null;
      claimed = true;
      return job;
    },
    setStage: vi.fn(),
    persist: vi.fn(),
    fail: vi.fn(async () => true),
    recordTerminal: vi.fn(async () => {}),
  };
}
describe("explicit execution store", () => {
  it("allows one winning claim with the real processor", async () => {
    const store = fixture();
    const run = createScanExecution({
      store,
      collect,
      persistEvidence: async () => {},
    });
    const results = await Promise.all([run(job.id), run(job.id)]);
    expect(results).toContainEqual({ status: "already_claimed" });
    expect(results).toContainEqual({
      status: "failed",
      failurePersistence: "persisted",
    });
    expect(store.persist).toHaveBeenCalledTimes(1);
  });
  it("preserves persistence failure state and terminal analytics", async () => {
    const store = fixture();
    store.persist = async () => {
      throw new Error("persist_job_failed");
    };
    expect(
      await createScanExecution({
        store,
        collect,
        persistEvidence: async () => {},
      })(job.id),
    ).toMatchObject({ status: "failed", failurePersistence: "persisted" });
    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({ category: "PERSIST_FAILED" }),
    );
    expect(store.recordTerminal).toHaveBeenCalledWith({
      jobId: job.id,
      status: "failed",
      coverage: 0,
    });
  });
  it("does not fabricate failure persistence or analytics", async () => {
    const store = fixture();
    store.persist = async () => {
      throw new Error("persist_job_failed");
    };
    store.fail = async () => false;
    expect(
      await createScanExecution({
        store,
        collect,
        persistEvidence: async () => {},
      })(job.id),
    ).toEqual({ status: "failed", failurePersistence: "not_persisted" });
    expect(store.recordTerminal).not.toHaveBeenCalled();
  });
});
