import { afterEach, describe, expect, it, vi } from "vitest";
import { collectScanProviders, processScan } from "@sme-scanner/scan-engine";

vi.mock("@sme-scanner/scan-engine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@sme-scanner/scan-engine")>();
  return { ...actual, processScan: vi.fn(async () => ({ status: "done" })) };
});
const storeMock = vi.hoisted(() => ({ marker: "neon-store" }));
vi.mock("./execution-store", () => ({
  createScanExecutionStore: () => storeMock,
  buildTrendDiffDeps: vi.fn(),
  buildAeoSnapshotDeps: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({}) }));
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

describe("pending Neon workspace completion bridge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    completionMock.mockReset();
    vi.restoreAllMocks();
  });
  it.each(["true", "false"])(
    "never sends Neon jobs to legacy completion when flag=%s",
    async (flag) => {
      vi.stubEnv("WORKSPACE_COMPLETION_ENABLED", flag);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(runScan("job", "session")).resolves.toEqual({
        status: "done",
      });
      expect(completionMock).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("[scan] workspace completion pending", {
        category: "neon_workspace_completion_pending",
        jobId: "job",
      });
    },
  );
});
vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => ({ marker: "legacy" }),
}));
