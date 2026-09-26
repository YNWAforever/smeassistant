import { waitUntil } from "@vercel/functions";

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
