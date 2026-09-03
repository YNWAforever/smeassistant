export type ScanExecutionRuntimeName = "vercel" | "cloudflare";

/**
 * Which dispatch route is asking. The two cut over at different stages.
 */
export type ScanDispatchPath = "client" | "scheduled";

/**
 * Every value SCAN_EXECUTION_RUNTIME is meant to be set to, including the
 * explicit no-op spelling. Used only to decide whether an unrecognized value
 * is worth a log line -- "vercel" and "scheduled" are both legitimate even
 * when they resolve this particular call to vercel (the scheduled rollout
 * stage deliberately leaves the client path on vercel), so neither should be
 * reported as a misconfiguration.
 */
const RECOGNIZED_RUNTIME_SETTINGS = new Set(["vercel", "cloudflare", "scheduled"]);

/**
 * The L6 kill switch, three-valued so the staged rollout both design docs
 * approved is actually reachable.
 *
 *   "cloudflare" -> both paths run on the Worker
 *   "scheduled"  -> only /api/cron/run-queued dispatches; the client-initiated
 *                   path stays inline on Vercel
 *   anything else (unset, misspelled, whitespace-padded) -> both inline
 *
 * The middle value exists because the design's stage 2 is "cut over the
 * scheduled path first -- lower blast radius, a handful of unattended scans a
 * day versus a user actively watching the client flow," and stage 3 is the
 * client path once that has proven reliable. A two-valued switch would move
 * both at once and there is no honest way to stage it from a preview
 * environment, which has neither production data nor the scheduler.
 *
 * Everything unrecognized means vercel: a runtime switch whose failure mode is
 * "scans stop happening" is worse than no switch at all, so this fails toward
 * the path that has been in production since launch. An unrecognized value
 * (not "vercel"/"cloudflare"/"scheduled") is logged -- silently -- because
 * "scheduled" is also a valid ScanDispatchPath spelling, and an operator
 * staging the rollout who typos SCAN_EXECUTION_RUNTIME=client would otherwise
 * get a silent no-op with no signal anything is wrong.
 *
 * SCAN_WORKER_URL missing or not a usable https origin also means vercel:
 * flipping the runtime without a real Worker to point at would otherwise send
 * every scan into a black hole.
 */
export function resolveScanExecutionRuntime(path: ScanDispatchPath): ScanExecutionRuntimeName {
  const setting = process.env.SCAN_EXECUTION_RUNTIME;
  const wants =
    setting === "cloudflare" || (setting === "scheduled" && path === "scheduled");
  if (!wants) {
    if (setting && !RECOGNIZED_RUNTIME_SETTINGS.has(setting)) {
      console.error("[scan/dispatch] unrecognized SCAN_EXECUTION_RUNTIME, staying on vercel", { setting, path });
    }
    return "vercel";
  }
  if (!process.env.SCAN_WORKER_URL) {
    console.error("[scan/dispatch] SCAN_EXECUTION_RUNTIME wants the Worker but SCAN_WORKER_URL is unset", {
      category: "scan_worker_url_missing",
      path,
    });
    return "vercel";
  }
  if (!workerOrigin()) {
    console.error("[scan/dispatch] SCAN_WORKER_URL is not a usable https origin", {
      category: "scan_worker_url_misconfigured",
      path,
    });
    return "vercel";
  }
  return "cloudflare";
}

/**
 * Validate SCAN_WORKER_URL down to a bare origin, mirroring
 * apps/scan-worker/src/run-scan.ts's validateOrigin() -- an equally
 * operator-configured value guarding the same CRON_SECRET, so it gets the
 * same scrutiny.
 *
 * Rejects anything that isn't https (an http:// URL would send CRON_SECRET in
 * cleartext) except localhost/127.0.0.1, so `wrangler dev` stays usable.
 * Rejects a path, query, or hash: SCAN_WORKER_URL="https://worker.example/app"
 * would otherwise have "/app" silently discarded by a trailing-slash-only
 * strip, 404 at "/app/run", and log indistinguishably from a real outage --
 * the exact trap validateOrigin's own comment names by example.
 */
function workerOrigin(): URL | null {
  const raw = process.env.SCAN_WORKER_URL;
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const localDev = url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  if (url.protocol !== "https:" && !localDev) return null;
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return url;
}

/**
 * Hand one job to the scan Worker. Returns whether the Worker acked it.
 *
 * Fire-and-forget past the ack by design: the Worker holds the ~600s scan in
 * ctx.waitUntil(), and this function's own caller is a Vercel route that must
 * return long before that finishes.
 */
export async function dispatchToScanWorker(jobId: string): Promise<boolean> {
  const origin = workerOrigin();
  if (!origin) {
    console.error("[scan/dispatch] SCAN_WORKER_URL is not a usable https origin", {
      jobId,
      category: "scan_worker_url_misconfigured",
    });
    return false;
  }
  try {
    const response = await fetch(origin.origin + "/run", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error("[scan/dispatch] worker rejected the job", { jobId, status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    // AbortSignal.timeout only cancels the client side of the request -- it
    // does not cancel the Worker's own execution. On a timeout the honest
    // state is "unknown, possibly running," not "did not start," so it gets
    // its own category rather than reading identically to a genuine DNS/TLS
    // failure. Not a correctness bug either way (claim_audit_job is
    // authoritative; a second dispatch just gets already_claimed) but
    // conflating the two sends whoever investigates ran:false chasing a ghost.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("[scan/dispatch] worker unreachable", {
      jobId,
      category: timedOut ? "scan_worker_ack_timeout" : "scan_worker_unreachable",
    });
    return false;
  }
}
