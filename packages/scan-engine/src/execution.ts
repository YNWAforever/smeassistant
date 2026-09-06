import { scoreAll } from "@sme-scanner/scoring";
import type { EvidenceCandidate } from "@sme-scanner/contracts";
import {
  createScanProcessor,
  type ScanProviderCollector,
  type ScanProcessResult,
} from "./processor";
import type { ScanExecutionStore } from "./execution-store";

export interface ScanExecutionRuntime {
  store: ScanExecutionStore;
  collect: ScanProviderCollector;
  /** App owns sharp/storage; candidates must be supplied explicitly. */
  persistEvidence: (
    jobId: string,
    candidates: EvidenceCandidate[],
  ) => Promise<void>;
  persistDiff?: (jobId: string) => Promise<unknown>;
  persistAeoSnapshots?: (jobId: string) => Promise<unknown>;
}
const POST_PROCESSING_TIMEOUT_MS = 10_000;
async function runBoundedPostProcessingStep(
  fn: (jobId: string) => Promise<unknown>,
  jobId: string,
  logMessage: string,
  category: string,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fn(jobId),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("step_timed_out")),
          POST_PROCESSING_TIMEOUT_MS,
        );
      }),
    ]);
  } catch {
    console.error(logMessage, { jobId, category });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createScanExecution(runtime: ScanExecutionRuntime) {
  const processor = createScanProcessor({
    ...runtime.store,
    collect: runtime.collect,
    score: scoreAll,
    persistEvidence: runtime.persistEvidence,
  });
  const runDiff = runtime.persistDiff ?? (async () => {});
  const runAeoSnapshots = runtime.persistAeoSnapshots ?? (async () => {});
  return async (jobId: string) => {
    const result = await processor(jobId);
    // Never in the scan's critical path: a merchant's report is delivered
    // whether or not last month's comparison or the AEO snapshot write
    // succeeded. Run concurrently, not sequentially — sequential bounded
    // steps would double the worst-case added latency after the report is
    // already fully persisted.
    if (result.status === "done" || result.status === "partial") {
      await Promise.allSettled([
        runBoundedPostProcessingStep(
          runDiff,
          jobId,
          "[scan/diff] trend diff failed",
          "diff_persist_failed",
        ),
        runBoundedPostProcessingStep(
          runAeoSnapshots,
          jobId,
          "[scan/aeo-snapshots] persist failed",
          "aeo_snapshot_persist_failed",
        ),
      ]);
    }
    return result;
  };
}

export async function processScan(
  jobId: string,
  runtime: ScanExecutionRuntime,
): Promise<ScanProcessResult> {
  return createScanExecution(runtime)(jobId);
}
