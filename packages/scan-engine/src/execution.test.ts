import { describe, expect, it, vi } from "vitest";
import { scoreAll } from "@sme-scanner/scoring";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createScanProcessor, type ScanProviderCollector } from "./processor";
import { createScanExecution } from "./execution";
import { recordEvent } from "./analytics";

vi.mock("./processor", async () => {
  const actual = await vi.importActual<typeof import("./processor")>("./processor");
  return {
    ...actual,
    createScanProcessor: vi.fn(),
  };
});

vi.mock("./analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./analytics")>();
  // createAnalyticsDependencies must stay real: recordScanCompleted calls it
  // with the fake supabase client these tests already supply, and a blanket
  // mock object would replace it with undefined. recordEvent resolves rather
  // than defaulting to undefined because recordScanCompleted now calls
  // `.then(...)` on its return value directly (to hand ctx.waitUntil an
  // always-resolving view of the promise), not just `await`s it.
  return { ...actual, recordEvent: vi.fn().mockResolvedValue({ recorded: true }) };
});

describe("createScanExecution", () => {
  it("builds the production processor with current persistence and analytics adapters", async () => {
    const processor = vi.fn().mockResolvedValue({ status: "done" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: "job-1",
        business_name: "Demo Coffee",
        ig_handle: "demo.coffee",
        website_url: "https://example.com",
        industry: "Cafe",
        district: "Central",
        region: "hk",
      }],
      error: null,
    });
    const stageEq = vi.fn().mockResolvedValue({ error: null });
    const findingsUpsert = vi.fn().mockResolvedValue({ error: null });
    const persistEq = vi.fn().mockResolvedValue({ error: null });
    const failureSelect = vi.fn().mockResolvedValue({ data: [{ id: "job-1" }], error: null });
    const failureIn = vi.fn().mockReturnValue({ select: failureSelect });
    const failureEq = vi.fn().mockReturnValue({ in: failureIn });
    const auditJobsUpdate = vi.fn((payload: Record<string, unknown>) => {
      if ("failure_category" in payload) return { eq: failureEq };
      if ("module_results" in payload) return { eq: persistEq };
      return { eq: stageEq };
    });
    const from = vi.fn((table: string) => {
      if (table === "audit_jobs") return { update: auditJobsUpdate };
      if (table === "audit_findings") return { upsert: findingsUpsert };
      throw new Error(`unexpected table: ${table}`);
    });
    const fakeSupabase = { rpc, from } as unknown as SupabaseClient;
    const collectProviders = vi.fn() as unknown as ScanProviderCollector;
    const persistEvidence = vi.fn();
    const waitUntil = vi.fn();
    const run = createScanExecution({
      supabase: fakeSupabase,
      anonymousSessionId: "session-1",
      collect: collectProviders,
      persistEvidence,
      waitUntil,
    });

    await run("job-1");

    expect(createScanProcessor).toHaveBeenCalledWith(expect.objectContaining({
      claimJob: expect.any(Function),
      collect: collectProviders,
      score: scoreAll,
      setStage: expect.any(Function),
      persist: expect.any(Function),
      persistEvidence,
      recordTerminal: expect.any(Function),
      fail: expect.any(Function),
    }));

    const deps = vi.mocked(createScanProcessor).mock.calls[0]![0];
    await expect(deps.claimJob("job-1")).resolves.toMatchObject({
      id: "job-1",
      business_name: "Demo Coffee",
      ig_handle: "demo.coffee",
    });
    expect(rpc).toHaveBeenCalledWith("claim_audit_job", { p_job_id: "job-1" });

    await deps.setStage?.("job-1", "collecting");
    expect(from).toHaveBeenCalledWith("audit_jobs");
    expect(auditJobsUpdate).toHaveBeenCalledWith({
      processing_stage: "collecting",
      status: "collecting",
    });
    expect(stageEq).toHaveBeenCalledWith("id", "job-1");

    await deps.persist({
      jobId: "job-1",
      status: "partial",
      overall: 87,
      coverage: 0.55,
      scoringVersion: "test-version",
      moduleResults: {
        ig: { status: "measured", score: 90, confidence: "high", evidenceCollectedAt: null, limitationCode: null },
      } as never,
      findings: [{
        finding_key: "ig-bio",
        module: "ig",
        severity: "medium",
        score_impact: -10,
        owner_message_zh: "msg",
        owner_message_en: "msg",
        owner_action_zh: null,
        owner_action_en: null,
        evidence: {},
        v02_agent_hint: null,
      }] as never,
      rawData: undefined,
    });
    expect(findingsUpsert).toHaveBeenCalledWith([expect.objectContaining({
      job_id: "job-1",
      finding_key: "ig-bio",
      module: "ig",
    })], { onConflict: "job_id,finding_key" });
    expect(auditJobsUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "partial",
      processing_stage: "partial",
      overall_score: 87,
      score_coverage: 0.55,
      scoring_version: "test-version",
    }));
    expect(persistEq).toHaveBeenCalledWith("id", "job-1");

    await deps.recordTerminal?.({ jobId: "job-1", status: "partial", coverage: 0.55 });
    expect(recordEvent).toHaveBeenCalledWith(
      { name: "scan_completed", properties: { outcome: "partial", coverage: 0.55 } },
      { jobId: "job-1", anonymousSessionId: "session-1" },
      expect.objectContaining({
        insert: expect.any(Function),
        capturePostHog: expect.any(Function),
        waitUntil,
      }),
    );

    await expect(
      deps.fail?.({ jobId: "job-1", category: "PROCESSOR_FAILED", correlationId: "corr-1" }),
    ).resolves.toBe(true);
    expect(auditJobsUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      processing_stage: "failed",
      failure_category: "PROCESSOR_FAILED",
      failure_correlation_id: "corr-1",
    }));
    expect(failureEq).toHaveBeenCalledWith("id", "job-1");
    expect(failureIn).toHaveBeenCalledWith("status", ["collecting", "scoring", "persisting"]);
    expect(failureSelect).toHaveBeenCalledWith("id");
  });

  it("hands waitUntil an always-resolving view of the analytics promise, even if recordEvent itself rejects", async () => {
    // recordScanCompleted still awaits and propagates the real recordEvent
    // promise -- deps.recordTerminal below is expected to reject, and
    // processor.ts's own .catch is what contains that. The promise handed to
    // waitUntil is a separate concern: ctx.waitUntil tracks it directly
    // (there's no .catch in between on the Worker side), so a rejection there
    // must not surface as invocation-level noise.
    vi.mocked(recordEvent).mockRejectedValueOnce(new Error("posthog and postgres both down"));
    const waitUntil = vi.fn();

    createScanExecution({
      supabase: {} as unknown as SupabaseClient,
      anonymousSessionId: "session-1",
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      waitUntil,
    });
    const deps = vi.mocked(createScanProcessor).mock.calls.at(-1)![0];

    await expect(
      deps.recordTerminal?.({ jobId: "job-1", status: "failed", coverage: 0 }),
    ).rejects.toThrow("posthog and postgres both down");

    expect(waitUntil).toHaveBeenCalledTimes(1);
    const registered = waitUntil.mock.calls[0]![0] as Promise<unknown>;
    await expect(registered).resolves.toBeUndefined();
  });

  it("does not fail the scan when the trend diff throws", async () => {
    const processor = vi.fn().mockResolvedValue({ status: "done" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const fakeSupabase = {} as unknown as SupabaseClient;
    const persistDiff = vi.fn().mockRejectedValue(new Error("diff boom"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const run = createScanExecution({
      supabase: fakeSupabase,
      anonymousSessionId: "session-1",
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
    const fakeSupabase = {} as unknown as SupabaseClient;
    const persistDiff = vi.fn().mockResolvedValue({ stored: true });

    const run = createScanExecution({
      supabase: fakeSupabase,
      anonymousSessionId: "session-1",
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
    const fakeSupabase = {} as unknown as SupabaseClient;
    const persistDiff = vi.fn().mockResolvedValue({ stored: true });
    const persistAeoSnapshots = vi.fn().mockResolvedValue({ stored: 3 });

    const run = createScanExecution({
      supabase: fakeSupabase,
      anonymousSessionId: "session-1",
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
    const fakeSupabase = {} as unknown as SupabaseClient;
    const persistAeoSnapshots = vi.fn().mockRejectedValue(new Error("snapshot boom"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const run = createScanExecution({
      supabase: fakeSupabase,
      anonymousSessionId: "session-1",
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
    const processor = vi.fn().mockResolvedValue({ status: "failed", failurePersistence: "persisted" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const persistAeoSnapshots = vi.fn().mockResolvedValue({ stored: 0 });

    const run = createScanExecution({
      supabase: {} as unknown as SupabaseClient,
      anonymousSessionId: "session-1",
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      persistAeoSnapshots,
    });

    const result = await run("job-1");

    expect(result).toEqual({ status: "failed", failurePersistence: "persisted" });
    expect(persistAeoSnapshots).not.toHaveBeenCalled();
  });

  it("does not run the trend diff for a failed scan", async () => {
    const processor = vi.fn().mockResolvedValue({
      status: "failed",
      failurePersistence: "persisted",
    });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const fakeSupabase = {} as unknown as SupabaseClient;
    const persistDiff = vi.fn().mockResolvedValue({ stored: true });

    const run = createScanExecution({
      supabase: fakeSupabase,
      anonymousSessionId: "session-1",
      collect: vi.fn() as unknown as ScanProviderCollector,
      persistEvidence: vi.fn(),
      persistDiff,
    });

    const result = await run("job-1");

    expect(result).toEqual({ status: "failed", failurePersistence: "persisted" });
    expect(persistDiff).not.toHaveBeenCalled();
  });

  it("does not run the trend diff for a job another worker already claimed", async () => {
    // already_claimed means this invocation produced no result of its own, so
    // there is nothing new to compare.
    const processor = vi.fn().mockResolvedValue({ status: "already_claimed" });
    vi.mocked(createScanProcessor).mockReturnValue(processor);
    const persistDiff = vi.fn().mockResolvedValue({ stored: true });

    const run = createScanExecution({
      supabase: {} as unknown as SupabaseClient,
      anonymousSessionId: "session-1",
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
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "connection reset" } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const run = createScanExecution({
      supabase: fakeSupabase,
      anonymousSessionId: "session-1",
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
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const persistDiff = vi.fn(() => new Promise<never>(() => {}));

    const run = createScanExecution({
      supabase: {} as unknown as SupabaseClient,
      anonymousSessionId: "session-1",
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
