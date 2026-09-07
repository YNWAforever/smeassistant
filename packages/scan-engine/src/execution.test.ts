import { describe, expect, it, vi } from "vitest";
import { createScanProcessor, type ScanProviderCollector } from "./processor";
import { createScanExecution } from "./execution";
import type { ScanExecutionStore } from "./execution-store";
vi.mock("./processor", async () => ({
  ...(await vi.importActual<typeof import("./processor")>("./processor")),
  createScanProcessor: vi.fn(),
}));
const store = (): ScanExecutionStore => ({
  claimJob: vi.fn(),
  setStage: vi.fn(),
  persist: vi.fn(),
  fail: vi.fn(),
  recordTerminal: vi.fn(),
});
describe("createScanExecution", () => {
  it("passes the explicit store into the processor without a database client", async () => {
    vi.mocked(createScanProcessor).mockReturnValue(
      vi.fn().mockResolvedValue({ status: "already_claimed" }),
    );
    const storage = store();
    await createScanExecution({
      store: storage,
      collect: vi.fn(),
      persistEvidence: vi.fn(),
    })("job");
    expect(createScanProcessor).toHaveBeenLastCalledWith(
      expect.objectContaining(storage),
    );
  });
  it("does not fail the scan when the trend diff throws", async () => {
    const processor = vi.fn().mockResolvedValue({ status: "done" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const persistDiff = vi.fn().mockRejectedValue(new Error("diff boom"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const run = createScanExecution({
      store: store(),
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      persistDiff,
    });

    const result = await run("job-1");

    expect(result).toEqual({ status: "done" });
    expect(persistDiff).toHaveBeenCalledWith("job-1");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("runs the trend diff for a successful scan", async () => {
    const processor = vi.fn().mockResolvedValue({ status: "partial" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const persistDiff = vi.fn().mockResolvedValue({ stored: true });

    const run = createScanExecution({
      store: store(),
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      persistDiff,
    });

    const result = await run("job-1");

    expect(result).toEqual({ status: "partial" });
    expect(persistDiff).toHaveBeenCalledTimes(1);
    expect(persistDiff).toHaveBeenCalledWith("job-1");
  });

  it("runs the AEO snapshot persistence for a successful scan, concurrently with the diff", async () => {
    const processor = vi.fn().mockResolvedValue({ status: "done" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const persistDiff = vi.fn().mockResolvedValue({ stored: true });
    const persistAeoSnapshots = vi.fn().mockResolvedValue({ stored: 3 });

    const run = createScanExecution({
      store: store(),
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      persistDiff,
      persistAeoSnapshots,
    });

    const result = await run("job-1");

    expect(result).toEqual({ status: "done" });
    expect(persistAeoSnapshots).toHaveBeenCalledWith("job-1");
    expect(persistDiff).toHaveBeenCalledWith("job-1");
  });

  it("does not fail the scan when AEO snapshot persistence throws", async () => {
    const processor = vi.fn().mockResolvedValue({ status: "done" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const persistAeoSnapshots = vi
      .fn()
      .mockRejectedValue(new Error("snapshot boom"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const run = createScanExecution({
      store: store(),
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      persistDiff: vi.fn().mockResolvedValue({ stored: true }),
      persistAeoSnapshots,
    });

    const result = await run("job-1");

    expect(result).toEqual({ status: "done" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[scan/aeo-snapshots] persist failed",
      expect.objectContaining({ category: "aeo_snapshot_persist_failed" }),
    );
    consoleErrorSpy.mockRestore();
  });

  it("does not run AEO snapshot persistence for a failed scan", async () => {
    const processor = vi
      .fn()
      .mockResolvedValue({ status: "failed", failurePersistence: "persisted" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const persistAeoSnapshots = vi.fn().mockResolvedValue({ stored: 0 });

    const run = createScanExecution({
      store: store(),
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      persistAeoSnapshots,
    });

    const result = await run("job-1");

    expect(result).toEqual({
      status: "failed",
      failurePersistence: "persisted",
    });
    expect(persistAeoSnapshots).not.toHaveBeenCalled();
  });

  it("does not run the trend diff for a failed scan", async () => {
    const processor = vi.fn().mockResolvedValue({
      status: "failed",
      failurePersistence: "persisted",
    });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const persistDiff = vi.fn().mockResolvedValue({ stored: true });

    const run = createScanExecution({
      store: store(),
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      persistDiff,
    });

    const result = await run("job-1");

    expect(result).toEqual({
      status: "failed",
      failurePersistence: "persisted",
    });
    expect(persistDiff).not.toHaveBeenCalled();
  });

  it("does not run the trend diff for a job another worker already claimed", async () => {
    // already_claimed means this invocation produced no result of its own, so
    // there is nothing new to compare.
    const processor = vi.fn().mockResolvedValue({ status: "already_claimed" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const persistDiff = vi.fn().mockResolvedValue({ stored: true });

    const run = createScanExecution({
      store: store(),
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      persistDiff,
    });

    expect(await run("job-1")).toEqual({ status: "already_claimed" });
    expect(persistDiff).not.toHaveBeenCalled();
  });

  it("surfaces a failed diff read instead of treating it as nothing to compare", async () => {
    // Without the error check, a database outage returns data: null, which
    // persistScanDiff cannot tell from "no such row" — so it resolves quietly
    // and this log line never happens.
    const processor = vi.fn().mockResolvedValue({ status: "done" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const run = createScanExecution({
      store: store(),
      persistDiff: async () => {
        throw new Error("diff_head_read_failed");
      },
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
    });

    const result = await run("job-1");

    expect(result).toEqual({ status: "done" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[scan/diff] trend diff failed",
      expect.objectContaining({ category: "diff_persist_failed" }),
    );
    consoleErrorSpy.mockRestore();
  });

  it("gives up on a diff that hangs rather than holding the invocation open", async () => {
    vi.useFakeTimers();
    const processor = vi.fn().mockResolvedValue({ status: "done" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const persistDiff = vi.fn(() => new Promise<never>(() => {}));

    const run = createScanExecution({
      store: store(),
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      persistDiff,
    });

    const pending = run("job-1");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toEqual({ status: "done" });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });
});
