import { randomUUID } from "node:crypto";
import { jobsRepository } from "@/lib/repositories/jobs";
import { currentScanConsentPolicyVersion } from "./consent";

/**
 * The dispatch gate. Scan start writes the consent row in the same transaction
 * as the job, so a queued job cannot exist without one -- but a hand-inserted
 * row, an ops script, or a future second writer could still produce one, and
 * that is exactly where a scan must stop before it spends a cent on providers.
 *
 * A refused job is marked `failed` (a legal queued -> failed transition; no new
 * status value), so GET /api/scan/status reports it and the scanning page's
 * existing failure card surfaces it instead of polling for a job that will
 * never run.
 */
export type ScanConsentGate =
  | { ok: true }
  | { ok: false; code: "consent_required" | "consent_policy_stale"; status: 403; correlationId: string }
  | { ok: false; code: "unavailable"; status: 503 };

type ConsentGateDeps = Pick<typeof jobsRepository, "readScanConsent" | "failQueued">;

export async function assertScanConsent(
  jobId: string,
  deps: ConsentGateDeps = jobsRepository,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScanConsentGate> {
  let row: Awaited<ReturnType<ConsentGateDeps["readScanConsent"]>>;
  try {
    row = await deps.readScanConsent(jobId);
  } catch {
    // A transient database fault must never burn a merchant's scan: leave the
    // job queued and let the caller retry.
    return { ok: false, code: "unavailable", status: 503 };
  }
  if (!row || !row.granted) {
    const correlationId = randomUUID();
    await deps.failQueued(jobId, "consent_missing", correlationId);
    return { ok: false, code: "consent_required", status: 403, correlationId };
  }
  if (row.policy_version !== currentScanConsentPolicyVersion(env)) {
    const correlationId = randomUUID();
    await deps.failQueued(jobId, "consent_policy_stale", correlationId);
    return { ok: false, code: "consent_policy_stale", status: 403, correlationId };
  }
  return { ok: true };
}
