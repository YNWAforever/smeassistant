import type { DerivedAction } from "./actions";
import type { ModuleStateKey } from "./module-states";
import type { ScanDiffRow, SnapshotRecord } from "./snapshots";

export interface CompletedAction {
  id: string;
  workspace_id: string;
  location_id: string | null;
  template_key: string;
  completed_at: string | null;
  source_finding_keys: string[];
}

const MODULE_OF: Record<string, ModuleStateKey | undefined> = {
  gbp: "google_business",
  ig: "instagram",
  aeo: "search_ai",
};

/**
 * A continuing finding is not a new task. A completed task can recur only after
 * an explicit, comparable absent -> present transition in the measured source.
 * An absent finding in an unavailable/partial source is never a resolution.
 *
 * This proves recurrence of the observed issue, not that a particular reply was
 * published or that the earlier action caused a business outcome.
 */
export function recurringActionParent(input: {
  action: DerivedAction;
  completed: CompletedAction;
  snapshot: SnapshotRecord;
  baseline: SnapshotRecord | null;
  baselineScanStartedAt: string | null;
  baselineFindingKeys: ReadonlySet<string>;
  diff: ScanDiffRow | null;
}): string | null {
  const { action, completed, snapshot, baseline, baselineScanStartedAt, baselineFindingKeys, diff } = input;
  if (!baseline || !diff?.comparable || !snapshot.workspaceId
    || completed.workspace_id !== snapshot.workspaceId || completed.location_id !== snapshot.locationId
    || completed.template_key !== action.templateKey
    || baseline.workspaceId !== snapshot.workspaceId || baseline.locationId !== snapshot.locationId
    || snapshot.comparableTo !== baseline.id || snapshot.diffId !== diff.id
    || diff.head_job_id !== snapshot.jobId || diff.base_job_id !== baseline.jobId) return null;

  const completedAt = Date.parse(completed.completed_at ?? "");
  const baselineStartedAt = Date.parse(baselineScanStartedAt ?? "");
  const baselineObservedAt = Date.parse(baseline.observedAt);
  const currentObservedAt = Date.parse(snapshot.observedAt);
  if (![completedAt, baselineStartedAt, baselineObservedAt, currentObservedAt].every(Number.isFinite)
    || baselineStartedAt <= completedAt || baselineObservedAt < baselineStartedAt
    || currentObservedAt <= baselineObservedAt) return null;

  const currentKeys = action.sourceFindingKeys;
  const keys = new Set([...completed.source_finding_keys, ...currentKeys]);
  if (!currentKeys.length || !completed.source_finding_keys.length
    || !currentKeys.some((key) => diff.regressed_findings.includes(key))) return null;
  for (const key of keys) {
    const sourceModule = key.split(".")[0];
    const stateKey = MODULE_OF[sourceModule];
    if (!stateKey || !diff.intersection_modules.includes(sourceModule) || baselineFindingKeys.has(key)) return null;
    for (const source of [baseline, snapshot]) {
      const state = source.moduleStates[stateKey];
      // Legacy snapshots infer measured/low from a score alone. They do not
      // establish that the source collected the relevant facts completely.
      if (state.status !== "measured" || state.limitationCode !== null
        || (state.confidence !== "high" && state.confidence !== "medium")
        || state.score === null || !Number.isFinite(state.score)) return null;
    }
  }
  return completed.id;
}
