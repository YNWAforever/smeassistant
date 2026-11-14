import { waitUntil } from "@vercel/functions";
import { assertExecutionBudget, BudgetExhausted, withExecutionBudget, type ExecutionBudget } from "@/lib/jobs/execution-budget";
import { createStudioDeadline, type StudioDeadline } from "./deadline";

/** Reads may be abandoned; any writes must additionally use the fenced session. */
export function withinStudioBudget<T>(budget: ExecutionBudget, run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try { assertExecutionBudget(budget); } catch (error) { reject(error); return; }
    const abort = () => reject(new BudgetExhausted());
    budget.signal.addEventListener("abort", abort, { once: true });
    let work: Promise<T>;
    try { work = run(); } catch (error) {
      budget.signal.removeEventListener("abort", abort);
      reject(error);
      return;
    }
    work.then(value => {
      budget.signal.removeEventListener("abort", abort);
      try { assertExecutionBudget(budget); resolve(value); } catch (error) { reject(error); }
    }, error => {
      budget.signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

export interface StudioRequestLifetime {
  deadline: StudioDeadline;
  work<T>(run: () => Promise<T>): Promise<T>;
  completeWith(work: Promise<unknown>): void;
  onFinally(run: () => Promise<void>): void;
}

/** Return headers promptly, retaining request resources through durable completion. */
export function runStudioRequest(
  handle: (lifetime: StudioRequestLifetime) => Promise<Response>,
  unavailable: () => Response,
): Promise<Response> {
  const deadline = createStudioDeadline();
  const completions: Promise<unknown>[] = [];
  const finalizers: Array<() => Promise<void>> = [];
  let respond!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { respond = resolve; });
  const completion = withExecutionBudget(deadline.work, async () => {
    try {
      respond(await handle({
        deadline,
        work: run => withinStudioBudget(deadline.work, run),
        completeWith: work => { completions.push(work.catch(() => {})); },
        onFinally: run => { finalizers.push(run); },
      }));
      let consumed = 0;
      while (consumed < completions.length) {
        const batch = completions.slice(consumed);
        consumed = completions.length;
        await withinStudioBudget(deadline.finalization, () => Promise.all(batch));
      }
    } catch {
      // Resolving twice is harmless when headers have already been delivered.
      respond(unavailable());
    } finally {
      const finishing = Promise.allSettled(finalizers.map(run => Promise.resolve().then(run)));
      try { await withinStudioBudget(deadline.finalization, () => finishing); } catch { /* Sessions destroy themselves at the final cutoff. */ }
    }
  }).catch(() => { respond(unavailable()); }).finally(() => { deadline.dispose(); });
  // Durable work remains owned even if the HTTP client disconnects.
  waitUntil(completion);
  return response;
}
