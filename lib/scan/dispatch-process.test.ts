import { afterEach, describe, expect, it, vi } from "vitest";

const { waitUntil } = vi.hoisted(() => ({ waitUntil: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil }));

import { dispatchScanProcess } from "./dispatch-process";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("dispatchScanProcess", () => {
  it("returns false and fetches nothing without APP_ORIGIN", () => {
    vi.stubEnv("APP_ORIGIN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(dispatchScanProcess("job-1", vi.fn())).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the job to the process route under waitUntil", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.example.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    expect(dispatchScanProcess("job-1", vi.fn())).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://app.example.test/api/scan/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job-1" }),
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("reports a failed dispatch to the caller instead of throwing", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.example.test");
    const cause = new Error("down");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
    const onError = vi.fn();
    dispatchScanProcess("job-1", onError);
    await waitUntil.mock.calls[0][0];
    expect(onError).toHaveBeenCalledWith(cause);
  });
});
