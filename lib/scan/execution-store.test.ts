import { describe, expect, it, vi } from "vitest";
import { createScanExecutionStore } from "./execution-store";
import { createScanExecution, asClaimedJob } from "@sme-scanner/scan-engine";
describe("terminal analytics lifetime", () => {
  it("tracks the whole pending insertion and the later PostHog tail on a failed scan", async () => {
    let insertDone!: () => void;
    let captureDone!: () => void;
    const insert = new Promise<void>((resolve) => {
      insertDone = resolve;
    });
    const capture = new Promise<void>((resolve) => {
      captureDone = resolve;
    });
    const waited: Promise<unknown>[] = [];
    const store = createScanExecutionStore("session", {
      analytics: {
        insert: () => insert,
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
    expect(waited).toHaveLength(1);
    let settled = false;
    void waited[0].then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    insertDone();
    await waited[0];
    expect(waited).toHaveLength(2);
    let captured = false;
    void waited[1].then(() => {
      captured = true;
    });
    await Promise.resolve();
    expect(captured).toBe(false);
    captureDone();
    await waited[1];
    expect(captured).toBe(true);
  });
  it("keeps registered lifetime promises resolved on database failure", async () => {
    const waited: Promise<unknown>[] = [];
    const capture = vi.fn();
    const report = vi.fn();
    const store = createScanExecutionStore("session", {
      analytics: {
        insert: async () => {
          throw new Error("down");
        },
        capturePostHog: capture,
        reportError: report,
      },
      waitUntil: (p) => {
        waited.push(p);
      },
    });
    await store.recordTerminal({ jobId: "job", status: "failed", coverage: 0 });
    await expect(waited[0]).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith("backend_unavailable");
  });
});
