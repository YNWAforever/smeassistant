import { waitUntil } from "@vercel/functions";
import { requestSignal } from "@/lib/jobs/execution-budget";

/** Cron owns this request through both headers and body under its shared deadline. */
export async function dispatchScanProcessWithinBudget(jobId: string): Promise<boolean> {
  const origin = process.env.APP_ORIGIN;
  if (!origin) return false;
  const request = requestSignal(10_000);
  try {
    const response = await fetch(`${origin}/api/scan/process`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }), signal: request.signal,
    });
    // Consume/discard the body without retaining scan/provider details.
    const reader = response.body?.getReader();
    if (reader) { while (!(await reader.read()).done) { /* bounded by the request signal */ } }
    if (response.status === 503) return false; // at_capacity remains due; a later tick retries the same job.
    if (!response.ok) throw new Error("scan_process_http_error");
    return true;
  } finally { request.dispose(); }
}

/**
 * Asks the app to process a claimable job, the way the cron reclaim always
 * has: a best-effort POST to /api/scan/process kept alive by waitUntil. Shared
 * by the cron tick and the operator release (P3.5b). Returns whether a
 * dispatch was attempted; false only when APP_ORIGIN is not configured. The
 * process route's own claim is the gate, so a duplicate dispatch is harmless.
 */
export function dispatchScanProcess(jobId: string, onError: (cause: unknown) => void): boolean {
  const origin = process.env.APP_ORIGIN;
  if (!origin) return false;
  waitUntil(
    fetch(`${origin}/api/scan/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    })
      .then(() => undefined)
      .catch(onError),
  );
  return true;
}
