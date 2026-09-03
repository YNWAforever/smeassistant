import type { ScanDiffInput, ScanDiffModule } from "@sme-scanner/scoring";

/**
 * Adapt a stored audit_jobs row to the diff engine's input.
 *
 * Defensive by design: module_results is jsonb written by several versions of
 * the app, so anything unrecognisable is dropped rather than coerced. A dropped
 * module simply is not in the intersection, which the engine already handles
 * correctly — a coerced one would produce a confident wrong number.
 */
export interface DiffJobRow {
  scoring_version: string | null;
  module_results: Record<string, unknown> | null;
}

const MODULE_KEYS = ["ig", "gbp", "aeo", "trust"] as const;

export function toDiffInput(row: DiffJobRow): ScanDiffInput {
  const modules: ScanDiffInput["modules"] = {};
  const source = row.module_results;

  if (source && typeof source === "object") {
    for (const key of MODULE_KEYS) {
      const moduleEntry = source[key];
      if (!moduleEntry || typeof moduleEntry !== "object") continue;
      const record = moduleEntry as Record<string, unknown>;
      if (typeof record.status !== "string") continue;

      modules[key] = {
        status: record.status as ScanDiffModule["status"],
        score: typeof record.score === "number" ? record.score : null,
        findingKeys: (Array.isArray(record.findingKeys)
          ? record.findingKeys.filter((value): value is string => typeof value === "string")
          : []) as ScanDiffModule["findingKeys"],
      };
    }
  }

  return { scoringVersion: row.scoring_version, modules };
}
