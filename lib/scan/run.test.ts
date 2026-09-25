import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScanExecutionStore } from "./execution-store";
import { collectScanProviders, processScan } from "@sme-scanner/scan-engine";

vi.mock("@sme-scanner/scan-engine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@sme-scanner/scan-engine")>();
  return { ...actual, processScan: vi.fn(async () => ({ status: "done" })) };
});
const storeMock = vi.hoisted(() => ({ marker: "neon-store" }));
vi.mock("./execution-store", () => ({
  createScanExecutionStore: vi.fn(() => storeMock),
  buildTrendDiffDeps: vi.fn(),
  buildAeoSnapshotDeps: vi.fn(),
}));
const runtimeMocks = vi.hoisted(() => ({
  query: vi.fn(),
  capturePostHog: vi.fn(),
}));
const websiteMocks = vi.hoisted(() => ({
  run: vi.fn(async () => ({ evaluated: 15, passed: 9, results: [] })),
  postProcess: vi.fn(async () => ({ ran: true, snapshotId: "snap", error: null })),
}));
vi.mock("@/lib/website/checks", () => ({ runWebsiteChecks: websiteMocks.run }));
vi.mock("@/lib/workspace/post-process", () => ({
  postProcessWorkspaceScan: websiteMocks.postProcess,
}));
// fail() now runs on a transaction client, so the pool also connects; the
// client shares the same query mock so every statement is observable.
vi.mock("@/lib/db/client", () => ({
  getPool: () => ({
    query: runtimeMocks.query,
    connect: async () => ({ query: runtimeMocks.query, release: () => {} }),
  }),
}));
vi.mock("@/lib/analytics/posthog", () => ({
  capturePostHog: runtimeMocks.capturePostHog,
}));
const persistMocks = vi.hoisted(() => ({
  persistEvidenceSnapshots: vi.fn(async () => undefined),
}));
vi.mock("@/lib/evidence/persist", () => ({
  persistEvidenceSnapshots: persistMocks.persistEvidenceSnapshots,
}));

const completionMock = vi.hoisted(() =>
  vi.fn<
    (db: unknown, jobId: string, process?: (db: unknown, id: string) => Promise<unknown>) => Promise<{ status: string }>
  >(async () => ({ status: "completed" })),
);
vi.mock("@/lib/workspace/completion", () => ({
  completeWorkspaceScan: completionMock,
}));
import {
  resolveScanCollector,
  resolveScanFixtureName,
  resolveScanSourceMode,
  resolveScanRuntime,
  runScan,
} from "./run";

// runScan now reads the job once, before the completion claim, to decide
// whether website checks are worth collecting. Give that lookup an empty
// default so unrelated cases neither collect nor log about a failed lookup.
beforeEach(() => {
  runtimeMocks.query.mockReset();
  runtimeMocks.query.mockResolvedValue({ rows: [] });
});

describe("resolveScanSourceMode", () => {
  it("honours an explicit SCAN_SOURCES value", () => {
    expect(
      resolveScanSourceMode({
        SCAN_SOURCES: "live",
        NODE_ENV: "test",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("live");
    expect(
      resolveScanSourceMode({
        SCAN_SOURCES: " Fixture ",
        NODE_ENV: "production",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("fixture");
  });

  it("defaults to fixtures under vitest and live everywhere else", () => {
    expect(
      resolveScanSourceMode({
        NODE_ENV: "test",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("fixture");
    expect(
      resolveScanSourceMode({
        NODE_ENV: "production",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("live");
    expect(resolveScanSourceMode({} as unknown as NodeJS.ProcessEnv)).toBe(
      "live",
    );
  });

  it("falls back to the default on an unrecognised value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(
        resolveScanSourceMode({
          SCAN_SOURCES: "supplied",
          NODE_ENV: "production",
        } as unknown as NodeJS.ProcessEnv),
      ).toBe("live");
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("refuses fixtures on a Vercel production deployment and falls back to live", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      expect(
        resolveScanSourceMode({
          SCAN_SOURCES: "fixture",
          VERCEL_ENV: "production",
          NODE_ENV: "production",
        } as unknown as NodeJS.ProcessEnv),
      ).toBe("live");
      expect(error).toHaveBeenCalledWith(
        "[scan] SCAN_SOURCES=fixture is not allowed in production; using live",
        { category: "scan_sources_fixture_in_production" },
      );
    } finally {
      error.mockRestore();
    }
  });

  it("still allows fixtures on preview deployments and locally", () => {
    expect(
      resolveScanSourceMode({
        SCAN_SOURCES: "fixture",
        VERCEL_ENV: "preview",
        NODE_ENV: "production",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("fixture");
    expect(
      resolveScanSourceMode({
        SCAN_SOURCES: "fixture",
        NODE_ENV: "development",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("fixture");
  });
});

describe("resolveScanFixtureName", () => {
  it("accepts only known fixture names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(
        resolveScanFixtureName({
          SCAN_FIXTURE: "tw-cafe",
        } as unknown as NodeJS.ProcessEnv),
      ).toBe("tw-cafe");
      expect(
        resolveScanFixtureName({} as unknown as NodeJS.ProcessEnv),
      ).toBeUndefined();
      expect(
        resolveScanFixtureName({
          SCAN_FIXTURE: "nope",
        } as unknown as NodeJS.ProcessEnv),
      ).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("resolveScanCollector", () => {
  it("returns upstream's live collector in live mode and a fixture collector otherwise", () => {
    expect(
      resolveScanCollector({
        SCAN_SOURCES: "live",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(collectScanProviders);
    const fixture = resolveScanCollector({
      SCAN_SOURCES: "fixture",
    } as unknown as NodeJS.ProcessEnv);
    expect(fixture).not.toBe(collectScanProviders);
    expect(typeof fixture).toBe("function");
  });
});

describe("runScan", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(processScan).mockClear();
  });

  it("hands processScan explicit Neon storage and evidence dependencies", async () => {
    vi.stubEnv("SCAN_SOURCES", "live");
    await expect(runScan("job-1", "session-1")).resolves.toEqual({
      status: "done",
    });
    expect(processScan).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        store: storeMock,
        collect: collectScanProviders,
        persistEvidence: persistMocks.persistEvidenceSnapshots,
        persistDiff: expect.any(Function),
        persistAeoSnapshots: expect.any(Function),
      }),
    );
  });

  it("uses the fixture collector in fixture mode", async () => {
    vi.stubEnv("SCAN_SOURCES", "fixture");
    await runScan("job-1", "session-1");
    const collector = vi.mocked(processScan).mock.calls[0]![1].collect;
    expect(collector).not.toBe(collectScanProviders);
    expect(typeof collector).toBe("function");
  });

  it("re-exports the execution runtime switch", () => {
    vi.stubEnv("SCAN_EXECUTION_RUNTIME", "vercel");
    expect(resolveScanRuntime("client")).toBe("vercel");
  });
});

describe("Neon workspace completion bridge",()=>{
 afterEach(()=>{vi.unstubAllEnvs();completionMock.mockClear();completionMock.mockResolvedValue({status:"completed"});websiteMocks.run.mockClear();websiteMocks.postProcess.mockClear();vi.restoreAllMocks();});
 it.each(["true","false"])("completes Neon jobs independent of internal receiver flag=%s",async flag=>{completionMock.mockClear();vi.stubEnv("WORKSPACE_COMPLETION_ENABLED",flag);await expect(runScan("job","session")).resolves.toEqual({status:"done"});expect(completionMock).toHaveBeenCalledWith(expect.objectContaining({query:runtimeMocks.query}),"job",expect.any(Function));});
 it("does not change persisted terminal result when workspace effects need retry",async()=>{completionMock.mockResolvedValueOnce({status:"retry"});const log=vi.spyOn(console,"error").mockImplementation(()=>{});await expect(runScan("job","session")).resolves.toEqual({status:"done"});expect(log).toHaveBeenCalledWith("[scan] workspace completion retry",{category:"workspace_completion_retry",jobId:"job"});});
 it("does not complete work claimed by another runner",async()=>{completionMock.mockClear();vi.mocked(processScan).mockResolvedValueOnce({status:"already_claimed"});await runScan("job","session");expect(completionMock).not.toHaveBeenCalled();expect(websiteMocks.run).not.toHaveBeenCalled();});

 // The snapshot is built inside the completion transaction, which holds row
 // locks and must not make a network call, and recovery is contractually
 // collector-free. Collecting here -- before the claim -- is the only point at
 // which a post-scan snapshot can carry website evidence at all; without it the
 // checks ran once at claim time and the website read "not evaluated" forever.
 it("collects the website checks before the completion claim and hands them to post-processing",async()=>{
  runtimeMocks.query.mockResolvedValue({rows:[{workspace_id:"ws",status:"done",website_url:"https://shop.example",input_snapshot:null,raw_data:null}]});
  await runScan("job","session");
  expect(websiteMocks.run).toHaveBeenCalledWith("https://shop.example");
  const process=completionMock.mock.calls.at(-1)![2]!;
  const client={marker:"tx"};
  await process(client,"job");
  expect(websiteMocks.postProcess).toHaveBeenCalledWith(client,"job",{websiteChecks:{evaluated:15,passed:9,results:[]}});
 });

 // A public scan grows no workspace rows (guardrail 15) and must not cost an
 // outbound request either.
 it("spends no website fetch on a scan that belongs to no workspace",async()=>{
  runtimeMocks.query.mockResolvedValue({rows:[{workspace_id:null,status:"done",website_url:"https://shop.example",input_snapshot:null,raw_data:null}]});
  await runScan("job","session");
  expect(websiteMocks.run).not.toHaveBeenCalled();
  const process=completionMock.mock.calls.at(-1)![2]!;
  await process({},"job");
  expect(websiteMocks.postProcess).toHaveBeenCalledWith({},"job",{websiteChecks:null});
 });
});
describe("runScan host terminal lifetime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("writes scan_completed inside fail() and registers only the delayed capture with the actual Vercel lifetime API", async () => {
    const engine = await vi.importActual<
      typeof import("@sme-scanner/scan-engine")
    >("@sme-scanner/scan-engine");
    const adapter =
      await vi.importActual<typeof import("./execution-store")>(
        "./execution-store",
      );
    vi.mocked(processScan).mockImplementationOnce(engine.processScan);
    vi.mocked(createScanExecutionStore).mockImplementationOnce(
      adapter.createScanExecutionStore,
    );
    vi.stubEnv("SCAN_SOURCES", "fixture");
    vi.stubEnv("SCAN_FIXTURE", "tw-cafe");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const waited: Promise<unknown>[] = [];
    // The installed official API obtains the host owner from this request context.
    vi.stubGlobal(Symbol.for("@vercel/request-context"), {
      get: () => ({
        waitUntil: (promise: Promise<unknown>) => waited.push(promise),
      }),
    });
    runtimeMocks.query.mockImplementation(
      async (sql: string, values: unknown[]) => {
        if (sql.includes("RETURNING *"))
          return {
            rows: [{ id: "job", business_name: "fixture", region: "tw" }],
          };
        // Run the real fixture collector, then fail at the scoring stage so no
        // successful-scan postprocessing can accidentally keep analytics alive.
        if (values?.[1] === "scoring") throw new Error("fixture stage failure");
        return { rows: [{ id: "job" }] };
      },
    );
    let finishCapture!: () => void;
    const capture = new Promise<void>((resolve) => {
      finishCapture = resolve;
    });
    runtimeMocks.capturePostHog.mockReturnValue(capture);
    try {
      await expect(runScan("job", "session")).resolves.toMatchObject({
        status: "failed",
        failurePersistence: "persisted",
      });
      expect(runtimeMocks.query).toHaveBeenCalledWith(expect.any(String), [
        "job",
        "collecting_aeo",
        "collecting",
      ]);
      // The durable scan_completed row is written inside fail()'s own
      // transaction, after the guarded UPDATE matched, inside a savepoint;
      // recordTerminal never inserts.
      const statements = runtimeMocks.query.mock.calls.map(
        ([sql]) => sql as string,
      );
      const begin = statements.lastIndexOf("BEGIN");
      const failed = statements.findIndex(
        (sql, i) => i > begin && sql.includes("SET status='failed'"),
      );
      const savepoint = statements.indexOf("SAVEPOINT scan_event", failed);
      const insert = statements.findIndex(
        (sql, i) => i > savepoint && sql.includes("INSERT INTO scan_events"),
      );
      const release = statements.indexOf("RELEASE SAVEPOINT scan_event", insert);
      const commit = statements.indexOf("COMMIT", release);
      expect([begin, failed, savepoint, insert, release, commit].every((i) => i >= 0)).toBe(true);
      expect(begin < failed && failed < savepoint && savepoint < insert && insert < release && release < commit).toBe(true);
      expect(runtimeMocks.query.mock.calls[insert]![1]).toEqual([
        "job",
        "session",
        "scan_completed",
        JSON.stringify({ outcome: "failed", coverage: 0 }),
        "terminal",
      ]);
      // No second write through any other path: the pool and the transaction
      // client share this query mock, so every scan_events insert is visible
      // here, and exactly one exists.
      expect(
        statements.filter((sql) => /insert\s+into\s+scan_events/i.test(sql)),
      ).toHaveLength(1);
      // A regression that routed recordTerminal through the engine's
      // recordEvent would hit the store's throwing insert stub, which the
      // engine swallows and reports as backend_unavailable instead of
      // writing SQL. The statement count above cannot see that; this can.
      expect(console.error).not.toHaveBeenCalledWith(
        "[analytics] event_record_failed",
        expect.objectContaining({ category: "backend_unavailable" }),
      );
      // Only the PostHog transport is left to keep alive.
      expect(waited).toHaveLength(1);
      await Promise.resolve();
      expect(runtimeMocks.capturePostHog).toHaveBeenCalledTimes(1);
      let captured = false;
      void waited[0].then(() => {
        captured = true;
      });
      await Promise.resolve();
      expect(captured).toBe(false);
      finishCapture();
      await waited[0];
      expect(captured).toBe(true);
      expect(waited).toHaveLength(1);
    } finally {
      finishCapture();
      await Promise.all(waited);
    }
  });
});

describe("runScan budget refusal", () => {
  afterEach(() => {
    vi.mocked(processScan).mockClear();
    completionMock.mockClear();
  });

  it("reports at_capacity when the store refused the claim on budget, and completes nothing", async () => {
    vi.mocked(createScanExecutionStore).mockImplementationOnce(((...args: unknown[]) => {
      (args[1] as { onBudgetRefused?: (scope: "scan_global" | "scan_workspace") => void }).onBudgetRefused?.("scan_global");
      return storeMock;
    }) as never);
    vi.mocked(processScan).mockResolvedValueOnce({ status: "already_claimed" });
    await expect(runScan("job", "session")).resolves.toEqual({ status: "at_capacity" });
    expect(completionMock).not.toHaveBeenCalled();
  });

  it("still reports already_claimed when nothing was refused", async () => {
    vi.mocked(processScan).mockResolvedValueOnce({ status: "already_claimed" });
    await expect(runScan("job", "session")).resolves.toEqual({ status: "already_claimed" });
    expect(completionMock).not.toHaveBeenCalled();
  });
});
