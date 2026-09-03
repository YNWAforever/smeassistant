/**
 * Pick the scan a newly finished scan should be compared against: the merchant's
 * most recent earlier scan that actually produced a result.
 *
 * Deliberately not `parent_job_id`. That column records a manual re-run, so it
 * is set for some pairs and null for every scheduled one. Ordering by time over
 * the same place_id is the rule that holds for both.
 */
export interface PairCandidate {
  id: string;
  status: string;
  created_at: string;
}

/** Statuses that produced comparable measurements. */
const SCORED = new Set(["done", "partial"]);

export function selectBaseJob(
  head: { id: string; created_at: string },
  candidates: PairCandidate[],
): string | null {
  const headTime = Date.parse(head.created_at);

  const earlier = candidates
    .filter((row) => row.id !== head.id)
    .filter((row) => SCORED.has(row.status))
    .filter((row) => {
      const time = Date.parse(row.created_at);
      return !Number.isNaN(time) && time < headTime;
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  return earlier[0]?.id ?? null;
}
