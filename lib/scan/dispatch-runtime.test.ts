import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveScanExecutionRuntime, dispatchToScanWorker } from "./dispatch-runtime";

const JOB_ID = "11111111-2222-4333-8444-555555555555";

describe("resolveScanExecutionRuntime", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SCAN_WORKER_URL", "https://scan-worker.example");
  });

  it("defaults both paths to vercel when unset", () => {
    vi.stubEnv("SCAN_EXECUTION_RUNTIME", "");
    expect(resolveScanExecutionRuntime("client")).toBe("vercel");
    expect(resolveScanExecutionRuntime("scheduled")).toBe("vercel");
  });

  it("sends both paths to the worker on the exact value cloudflare", () => {
    vi.stubEnv("SCAN_EXECUTION_RUNTIME", "cloudflare");
    expect(resolveScanExecutionRuntime("client")).toBe("cloudflare");
    expect(resolveScanExecutionRuntime("scheduled")).toBe("cloudflare");
  });

  it("stages the rollout: scheduled moves first, the client path stays on vercel", () => {
    // This is the design's stage 2 -- lower blast radius, a handful of
    // unattended scans a day versus a user watching the client flow.
    vi.stubEnv("SCAN_EXECUTION_RUNTIME", "scheduled");
    expect(resolveScanExecutionRuntime("scheduled")).toBe("cloudflare");
    expect(resolveScanExecutionRuntime("client")).toBe("vercel");
  });

  it("falls back to vercel for any unrecognized value, on both paths", () => {
    for (const value of ["Cloudflare ", "workers", "SCHEDULED", "true"]) {
      vi.stubEnv("SCAN_EXECUTION_RUNTIME", value);
      expect(resolveScanExecutionRuntime("client")).toBe("vercel");
      expect(resolveScanExecutionRuntime("scheduled")).toBe("vercel");
    }
  });

  it("falls back to vercel when the worker url is missing, on both paths, so a half-configured flip cannot black-hole scans", () => {
    vi.stubEnv("SCAN_WORKER_URL", "");
    for (const value of ["cloudflare", "scheduled"]) {
      vi.stubEnv("SCAN_EXECUTION_RUNTIME", value);
      // "client" is the cell that matters most here: a half-configured flip to
      // "cloudflare" with no SCAN_WORKER_URL would otherwise black-hole every
      // user-initiated scan, not just the lower-traffic scheduled path.
      expect(resolveScanExecutionRuntime("client")).toBe("vercel");
      expect(resolveScanExecutionRuntime("scheduled")).toBe("vercel");
    }
  });

  describe("SCAN_WORKER_URL shape validation", () => {
    // Mirrors apps/scan-worker/src/run-scan.ts's validateOrigin() -- an
    // equally operator-configured value guarding the same CRON_SECRET gets
    // the same scrutiny, not a bare truthiness check.
    it("rejects a non-https, non-localhost url so the bearer secret is never sent in cleartext", () => {
      vi.stubEnv("SCAN_WORKER_URL", "http://scan-worker.example");
      vi.stubEnv("SCAN_EXECUTION_RUNTIME", "cloudflare");
      expect(resolveScanExecutionRuntime("client")).toBe("vercel");
    });

    it("rejects a url with a base path instead of silently truncating it", () => {
      // https://worker.example/app would otherwise have "/app" discarded by a
      // trailing-slash-only strip, 404 at "/app/run", and log
      // indistinguishably from a real outage.
      vi.stubEnv("SCAN_WORKER_URL", "https://scan-worker.example/app");
      vi.stubEnv("SCAN_EXECUTION_RUNTIME", "cloudflare");
      expect(resolveScanExecutionRuntime("client")).toBe("vercel");
    });

    it("rejects a url carrying a query string or fragment", () => {
      vi.stubEnv("SCAN_WORKER_URL", "https://scan-worker.example/?token=x");
      vi.stubEnv("SCAN_EXECUTION_RUNTIME", "cloudflare");
      expect(resolveScanExecutionRuntime("client")).toBe("vercel");
    });

    it("keeps http allowed for localhost and 127.0.0.1, so wrangler dev stays usable", () => {
      vi.stubEnv("SCAN_EXECUTION_RUNTIME", "cloudflare");
      vi.stubEnv("SCAN_WORKER_URL", "http://localhost:8787");
      expect(resolveScanExecutionRuntime("client")).toBe("cloudflare");
      vi.stubEnv("SCAN_WORKER_URL", "http://127.0.0.1:8787");
      expect(resolveScanExecutionRuntime("client")).toBe("cloudflare");
    });

    it("accepts a bare https origin with or without a trailing slash", () => {
      vi.stubEnv("SCAN_EXECUTION_RUNTIME", "cloudflare");
      vi.stubEnv("SCAN_WORKER_URL", "https://scan-worker.example");
      expect(resolveScanExecutionRuntime("client")).toBe("cloudflare");
      vi.stubEnv("SCAN_WORKER_URL", "https://scan-worker.example/");
      expect(resolveScanExecutionRuntime("client")).toBe("cloudflare");
    });
  });

  describe("diagnostic logging", () => {
    it("logs when the value is not one of vercel/cloudflare/scheduled", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // The bug this guards: SCAN_EXECUTION_RUNTIME's valid spellings overlap
      // with ScanDispatchPath's own spellings ("scheduled"), so an operator
      // staging the rollout could plausibly type "client" here by mistake and
      // get a silent no-op with nothing in the logs pointing at why.
      vi.stubEnv("SCAN_EXECUTION_RUNTIME", "client");
      resolveScanExecutionRuntime("client");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("unrecognized SCAN_EXECUTION_RUNTIME"),
        expect.objectContaining({ setting: "client" }),
      );
      errorSpy.mockRestore();
    });

    it("does not log for the explicit no-op spelling vercel", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubEnv("SCAN_EXECUTION_RUNTIME", "vercel");
      resolveScanExecutionRuntime("client");
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("does not log when scheduled legitimately resolves the client path to vercel", () => {
      // This is the normal, expected shape of the whole staged rollout -- it
      // must not read as a misconfiguration on every single client-path scan
      // for as long as stage 2 is live.
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubEnv("SCAN_EXECUTION_RUNTIME", "scheduled");
      resolveScanExecutionRuntime("client");
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});

describe("dispatchToScanWorker", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SCAN_WORKER_URL", "https://scan-worker.example");
    vi.stubEnv("CRON_SECRET", "d".repeat(32));
  });

  it("posts the job id with the bearer secret", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchToScanWorker(JOB_ID)).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://scan-worker.example/run");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${"d".repeat(32)}`);
    expect(JSON.parse(String(init.body))).toEqual({ jobId: JOB_ID });
  });

  it("drops a base path rather than silently posting to the wrong route", async () => {
    vi.stubEnv("SCAN_WORKER_URL", "https://scan-worker.example/app");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchToScanWorker(JOB_ID)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports failure on a non-2xx ack rather than pretending the scan started", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    await expect(dispatchToScanWorker(JOB_ID)).resolves.toBe(false);
  });

  it("reports failure when the worker is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("dns"); }));
    await expect(dispatchToScanWorker(JOB_ID)).resolves.toBe(false);
  });

  it("logs a genuine failure as scan_worker_unreachable, not a timeout", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("dns"); }));

    await dispatchToScanWorker(JOB_ID);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("worker unreachable"),
      expect.objectContaining({ category: "scan_worker_unreachable" }),
    );
    errorSpy.mockRestore();
  });

  it("logs an aborted ack as scan_worker_ack_timeout, distinct from an unreachable worker", async () => {
    // AbortSignal.timeout only cancels the client side -- it does not cancel
    // the Worker's own execution, so the honest state on a timeout is
    // "unknown, possibly running," not "did not start." Conflating this with
    // a genuine DNS/TLS failure sends whoever investigates ran:false chasing
    // a ghost.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    }));

    await expect(dispatchToScanWorker(JOB_ID)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("worker unreachable"),
      expect.objectContaining({ category: "scan_worker_ack_timeout" }),
    );
    errorSpy.mockRestore();
  });
});
