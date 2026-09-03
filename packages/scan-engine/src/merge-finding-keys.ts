/**
 * `audit_jobs.module_results` carries score/status/confidence per channel but
 * never which findings fired on it — `finding_key` lives only in
 * `audit_findings`, keyed by `(job_id, module)`. `toDiffInput` reads
 * `module_results[key].findingKeys`, and nothing else in the write path ever
 * populates it, so without this merge every stored diff reports zero
 * resolved/regressed/decayed findings regardless of what actually changed.
 */
export interface StoredFinding {
  module: string;
  finding_key: string;
}

export function mergeFindingKeysIntoModuleResults(
  moduleResults: Record<string, unknown> | null,
  findings: StoredFinding[],
): Record<string, unknown> | null {
  if (!moduleResults) return moduleResults;

  const byModule = new Map<string, string[]>();
  for (const finding of findings) {
    const list = byModule.get(finding.module) ?? [];
    list.push(finding.finding_key);
    byModule.set(finding.module, list);
  }

  return Object.fromEntries(
    Object.entries(moduleResults).map(([key, value]) => [
      key,
      // A module's stored value should always be an object, but this mirrors
      // to-diff-input.ts's own defensiveness against jsonb written by an
      // earlier app version rather than assuming today's shape everywhere.
      value && typeof value === "object"
        ? { ...value, findingKeys: byModule.get(key) ?? [] }
        : value,
    ]),
  );
}
