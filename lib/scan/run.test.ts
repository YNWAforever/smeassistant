import { afterEach, describe, expect, it, vi } from "vitest";
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
  insert: vi.fn(),
  capturePostHog: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  getPool: () => ({ query: runtimeMocks.query }),
}));
vi.mock("@/lib/repositories/events", () => ({
  eventRepository: () => ({ insert: runtimeMocks.insert }),
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
  vi.fn(async () => ({ status: "completed" })),
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
 afterEach(()=>{vi.unstubAllEnvs();completionMock.mockClear();completionMock.mockResolvedValue({status:"completed"});vi.restoreAllMocks();});
 it.each(["true","false"])("completes Neon jobs independent of internal receiver flag=%s",async flag=>{completionMock.mockClear();vi.stubEnv("WORKSPACE_COMPLETION_ENABLED",flag);await expect(runScan("job","session")).resolves.toEqual({status:"done"});expect(completionMock).toHaveBeenCalledWith({query:runtimeMocks.query},"job");});
 it("does not change persisted terminal result when workspace effects need retry",async()=>{completionMock.mockResolvedValueOnce({status:"retry"});const log=vi.spyOn(console,"error").mockImplementation(()=>{});await expect(runScan("job","session")).resolves.toEqual({status:"done"});expect(log).toHaveBeenCalledWith("[scan] workspace completion retry",{category:"workspace_completion_retry",jobId:"job"});});
 it("does not complete work claimed by another runner",async()=>{completionMock.mockClear();vi.mocked(processScan).mockResolvedValueOnce({status:"already_claimed"});await runScan("job","session");expect(completionMock).not.toHaveBeenCalled();});
});
describe("runScan host terminal lifetime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("registers pending insertion and delayed capture with the actual Vercel lifetime API", async () => {
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
        if (values[1] === "scoring") throw new Error("fixture stage failure");
        return { rows: [{ id: "job" }] };
      },
    );
    let finishInsert!: () => void;
    let finishCapture!: () => void;
    const insertion = new Promise<void>((resolve) => {
      finishInsert = resolve;
    });
    const capture = new Promise<void>((resolve) => {
      finishCapture = resolve;
    });
    runtimeMocks.insert.mockReturnValue(insertion);
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
      expect(runtimeMocks.insert).toHaveBeenCalledTimes(1);
      expect(waited).toHaveLength(1);
      let inserted = false;
      void waited[0].then(() => {
        inserted = true;
      });
      await Promise.resolve();
      expect(inserted).toBe(false);
      expect(runtimeMocks.capturePostHog).not.toHaveBeenCalled();
      finishInsert();
      await waited[0];
      expect(waited).toHaveLength(2);
      expect(runtimeMocks.capturePostHog).toHaveBeenCalledTimes(1);
      let captured = false;
      void waited[1].then(() => {
        captured = true;
      });
      await Promise.resolve();
      expect(captured).toBe(false);
      finishCapture();
      await waited[1];
      expect(captured).toBe(true);
    } finally {
      finishInsert();
      finishCapture();
      await Promise.all(waited);
    }
  });
});
