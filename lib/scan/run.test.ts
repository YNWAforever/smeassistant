import { afterEach, describe, expect, it, vi } from "vitest";
import { collectScanProviders, processScan } from "@sme-scanner/scan-engine";

vi.mock("@sme-scanner/scan-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sme-scanner/scan-engine")>();
  return { ...actual, processScan: vi.fn(async () => ({ status: "done" })) };
});
const supabaseMocks = vi.hoisted(() => ({ supabaseServer: vi.fn(() => ({ marker: "fake-client" })) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: supabaseMocks.supabaseServer }));
const persistMocks = vi.hoisted(() => ({ persistEvidenceSnapshots: vi.fn(async () => undefined) }));
vi.mock("@/lib/evidence/persist", () => ({ persistEvidenceSnapshots: persistMocks.persistEvidenceSnapshots }));

import { resolveScanCollector, resolveScanFixtureName, resolveScanSourceMode, resolveScanRuntime, runScan } from "./run";

describe("resolveScanSourceMode", () => {
  it("honours an explicit SCAN_SOURCES value", () => {
    expect(resolveScanSourceMode({ SCAN_SOURCES: "live", NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv)).toBe("live");
    expect(resolveScanSourceMode({ SCAN_SOURCES: " Fixture ", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe("fixture");
  });

  it("defaults to fixtures under vitest and live everywhere else", () => {
    expect(resolveScanSourceMode({ NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv)).toBe("fixture");
    expect(resolveScanSourceMode({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe("live");
    expect(resolveScanSourceMode({} as unknown as NodeJS.ProcessEnv)).toBe("live");
  });

  it("falls back to the default on an unrecognised value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(resolveScanSourceMode({ SCAN_SOURCES: "supplied", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe("live");
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("resolveScanFixtureName", () => {
  it("accepts only known fixture names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(resolveScanFixtureName({ SCAN_FIXTURE: "tw-cafe" } as unknown as NodeJS.ProcessEnv)).toBe("tw-cafe");
      expect(resolveScanFixtureName({} as unknown as NodeJS.ProcessEnv)).toBeUndefined();
      expect(resolveScanFixtureName({ SCAN_FIXTURE: "nope" } as unknown as NodeJS.ProcessEnv)).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("resolveScanCollector", () => {
  it("returns upstream's live collector in live mode and a fixture collector otherwise", () => {
    expect(resolveScanCollector({ SCAN_SOURCES: "live" } as unknown as NodeJS.ProcessEnv)).toBe(collectScanProviders);
    const fixture = resolveScanCollector({ SCAN_SOURCES: "fixture" } as unknown as NodeJS.ProcessEnv);
    expect(fixture).not.toBe(collectScanProviders);
    expect(typeof fixture).toBe("function");
  });
});

describe("runScan", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(processScan).mockClear();
  });

  it("hands processScan the job, the session, the selected collector, evidence persistence and the service client", async () => {
    vi.stubEnv("SCAN_SOURCES", "live");
    await expect(runScan("job-1", "session-1")).resolves.toEqual({ status: "done" });
    expect(processScan).toHaveBeenCalledWith(
      "job-1",
      "session-1",
      collectScanProviders,
      persistMocks.persistEvidenceSnapshots,
      { marker: "fake-client" },
    );
  });

  it("uses the fixture collector in fixture mode", async () => {
    vi.stubEnv("SCAN_SOURCES", "fixture");
    await runScan("job-1", "session-1");
    const collector = vi.mocked(processScan).mock.calls[0]![2];
    expect(collector).not.toBe(collectScanProviders);
    expect(typeof collector).toBe("function");
  });

  it("re-exports the execution runtime switch", () => {
    vi.stubEnv("SCAN_EXECUTION_RUNTIME", "vercel");
    expect(resolveScanRuntime("client")).toBe("vercel");
  });
});
