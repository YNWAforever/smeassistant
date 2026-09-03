export type AuditJobStatus =
  | "queued"
  | "collecting"
  | "scoring"
  | "persisting"
  | "done"
  | "partial"
  | "failed";

const NEXT: Record<AuditJobStatus, readonly AuditJobStatus[]> = {
  queued: ["collecting", "failed"],
  collecting: ["scoring", "failed"],
  scoring: ["persisting", "failed"],
  persisting: ["done", "partial", "failed"],
  done: [],
  partial: [],
  failed: [],
};

export function canTransitionJob(from: AuditJobStatus, to: AuditJobStatus) {
  return NEXT[from].includes(to);
}

/**
 * A status the job will never leave on its own. Derived from NEXT rather than a
 * second hand-written list, so adding a status to the machine cannot leave a
 * consumer with a stale idea of "finished".
 */
export function isTerminalJobStatus(status: string): boolean {
  const next = NEXT[status as AuditJobStatus];
  return Array.isArray(next) && next.length === 0;
}
