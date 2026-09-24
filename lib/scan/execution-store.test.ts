import { describe, expect, it, vi } from "vitest";
import { createScanExecutionStore } from "./execution-store";
import { createScanExecution, asClaimedJob } from "@sme-scanner/scan-engine";
describe("terminal analytics lifetime", () => {
  it("tracks the PostHog tail on a failed scan and never inserts from recordTerminal", async () => {
    let captureDone!: () => void;
    const capture = new Promise<void>((resolve) => {
      captureDone = resolve;
    });
    const insert = vi.fn(async () => ({ inserted: true }));
    const waited: Promise<unknown>[] = [];
    const store = createScanExecutionStore("session", {
      analytics: {
        insert,
        capturePostHog: () => capture,
        reportError: vi.fn(),
      },
      waitUntil: (p) => {
        waited.push(p);
      },
    });
    store.claimJob = async () =>
      asClaimedJob({ id: "job", business_name: "fixture" });
    store.setStage = async () => {};
    store.persist = async () => {};
    const unavailable = {
      status: "unavailable",
      limitationCode: "NOT_MEASURED",
    } as const;
    expect(
      await createScanExecution({
        store,
        collect: async () => ({
          ig: unavailable,
          gbp: unavailable,
          aeo: unavailable,
        }),
        persistEvidence: async () => {},
      })("job"),
    ).toEqual({ status: "failed", failurePersistence: "persisted" });
    // persist() is stubbed here, so this cannot prove where the row is
    // written. What it proves: recordTerminal registers exactly one host
    // lifetime promise, that promise is the PostHog tail, and recordTerminal
    // never calls analytics.insert.
    expect(waited).toHaveLength(1);
    let settled = false;
    void waited[0].then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    captureDone();
    await waited[0];
    expect(insert).not.toHaveBeenCalled();
  });
  it("keeps the registered lifetime promise resolved when PostHog fails", async () => {
    const waited: Promise<unknown>[] = [];
    const report = vi.fn();
    const insert = vi.fn();
    const store = createScanExecutionStore("session", {
      analytics: {
        insert,
        capturePostHog: async () => {
          throw new Error("down");
        },
        reportError: report,
      },
      waitUntil: (p) => {
        waited.push(p);
      },
    });
    await store.recordTerminal({ jobId: "job", status: "failed", coverage: 0 });
    await expect(waited[0]).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith("provider_unavailable");
    expect(insert).not.toHaveBeenCalled();
  });
});
