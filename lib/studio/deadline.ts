import { createExecutionBudget } from "@/lib/jobs/execution-budget";

export const STUDIO_WORK_MS = 50_000;
export const STUDIO_FINALIZATION_MS = 55_000;

/** Owned by the entire turn, including the response stream's completion. */
export function createStudioDeadline({ now = () => performance.now() }: { now?: () => number } = {}) {
  const origin = now();
  const workDeadlineMs = origin + STUDIO_WORK_MS;
  const finalDeadlineMs = origin + STUDIO_FINALIZATION_MS;
  const work = createExecutionBudget({ deadlineMs: workDeadlineMs, reserveMs: STUDIO_FINALIZATION_MS - STUDIO_WORK_MS, now });
  const finalization = createExecutionBudget({ deadlineMs: finalDeadlineMs, reserveMs: 0, now });
  return {
    workDeadlineMs,
    finalDeadlineMs,
    work,
    finalization,
    dispose() {
      work.dispose();
      finalization.dispose();
    },
  };
}

export type StudioDeadline = ReturnType<typeof createStudioDeadline>;
