import { afterEach, expect, it, vi } from "vitest";
import {
  resolveScanExecutionRuntime,
  dispatchToScanWorker,
} from "./dispatch-runtime";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each(["", "vercel", "scheduled", "cloudflare", "unknown"])(
  "keeps both %s paths on compatible Neon Vercel store",
  (setting) => {
    vi.stubEnv("SCAN_EXECUTION_RUNTIME", setting);
    vi.stubEnv("SCAN_WORKER_URL", "https://legacy.example");
    expect(resolveScanExecutionRuntime("client")).toBe("vercel");
    expect(resolveScanExecutionRuntime("scheduled")).toBe("vercel");
  },
);
it.each([
  "https://legacy.example",
  "https://user:secret@legacy.example",
  "http://localhost:8787",
  "",
])("direct dispatch fails closed without reviewed parity (%s)", async (url) => {
  vi.stubEnv("SCAN_WORKER_URL", url);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    await dispatchToScanWorker("11111111-2222-4333-8444-555555555555"),
  ).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
