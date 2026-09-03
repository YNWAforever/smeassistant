import { diffScans } from "@sme-scanner/scoring";
import { toDiffInput, type DiffJobRow } from "./to-diff-input";
import { selectBaseJob, type PairCandidate } from "./select-pair";

/**
 * Compare a finished scan with the merchant's previous one and store the result.
 *
 * Every comparison rule lives in packages/scoring/src/diff.ts. This function
 * chooses the pair, calls it, and writes what it returns — it does not decide
 * what "improved" means.
 */
export interface PersistDiffDeps {
  loadHead: (jobId: string) => Promise<
    (DiffJobRow & { id: string; place_id: string | null; created_at: string }) | null
  >;
  listCandidates: (placeId: string) => Promise<PairCandidate[]>;
  loadJob: (jobId: string) => Promise<DiffJobRow | null>;
  saveDiff: (row: Record<string, unknown>) => Promise<void>;
}

export type PersistDiffResult =
  | { stored: true }
  | { stored: false; reason: "no_head" | "no_place_id" | "no_base" | "no_base_row" };

export async function persistScanDiff(
  headJobId: string,
  deps: PersistDiffDeps,
): Promise<PersistDiffResult> {
  const head = await deps.loadHead(headJobId);
  if (!head) return { stored: false, reason: "no_head" };
  // place_id is how a merchant's scans are linked across months; without it
  // there is no sequence to compare within.
  if (!head.place_id) return { stored: false, reason: "no_place_id" };

  const candidates = await deps.listCandidates(head.place_id);
  const baseJobId = selectBaseJob({ id: head.id, created_at: head.created_at }, candidates);
  if (!baseJobId) return { stored: false, reason: "no_base" };

  const baseRow = await deps.loadJob(baseJobId);
  if (!baseRow) return { stored: false, reason: "no_base_row" };

  const diff = diffScans(toDiffInput(baseRow), toDiffInput(head));

  await deps.saveDiff({
    base_job_id: baseJobId,
    head_job_id: head.id,
    comparable: diff.comparable,
    incomparable_reason: diff.incomparableReason,
    composite_withheld_reason: diff.compositeWithheldReason,
    intersection_modules: diff.intersectionModules,
    composite_base: diff.compositeBase,
    composite_head: diff.compositeHead,
    composite_delta: diff.compositeDelta,
    resolved_findings: diff.resolvedFindings,
    regressed_findings: diff.regressedFindings,
    decayed_findings: diff.decayedFindings,
    lost_coverage: diff.lostCoverage,
    gained_coverage: diff.gainedCoverage,
  });

  return { stored: true };
}
