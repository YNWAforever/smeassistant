import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool } from "pg";
export interface ExecutionBudget { remainingMs(): number; signal: AbortSignal; cleanupRemainingMs?(): number; statementLimitMs?: number }
export class BudgetExhausted extends Error { constructor() { super("execution_budget_exhausted"); this.name = "BudgetExhausted"; } }
interface ExecutionContext { budget: ExecutionBudget; pool?: Pool }
const context = new AsyncLocalStorage<ExecutionContext>();
export function createExecutionBudget({ durationMs = 55_000, reserveMs = 5000, statementLimitMs, now = () => performance.now() }: { durationMs?: number; reserveMs?: number; statementLimitMs?: number; now?: () => number } = {}) {
  const deadline = now() + durationMs, controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(new BudgetExhausted()),durationMs); timer.unref?.();
  return {
    statementLimitMs,
    signal: controller.signal,
    remainingMs() { const remaining = Math.max(0,Math.floor(deadline-now())); if (!remaining) controller.abort(new BudgetExhausted()); return remaining; },
    cleanupRemainingMs: () => Math.max(0,Math.floor(deadline+reserveMs-now())),
    dispose: () => clearTimeout(timer),
  };
}
export const currentExecutionBudget = () => context.getStore()?.budget;
export function assertExecutionBudget(budget = currentExecutionBudget()): void {
  if (budget && (budget.remainingMs() <= 0 || budget.signal.aborted)) throw new BudgetExhausted();
}
export async function withExecutionBudget<T>(budget: ExecutionBudget, run: () => Promise<T>): Promise<T> {
  const scope: ExecutionContext = { budget };
  return context.run(scope,async()=>{try{return await run();}finally{await scope.pool?.end();}});
}
/** Only compensation/settlement may use the reserved five seconds; never new claims/provider work. */
export async function settleWithinReserve<T>(budget: ExecutionBudget | undefined, run: () => Promise<T>): Promise<T> {
  if (!budget || (budget.remainingMs()>5000 && !budget.signal.aborted)) return run();
  const remaining = Math.min(5000,budget.cleanupRemainingMs?.() ?? 5000);
  if (remaining <= 0) throw new BudgetExhausted();
  const reserve = createExecutionBudget({durationMs:remaining,reserveMs:0});
  try { return await withExecutionBudget(reserve,run); } finally { reserve.dispose(); }
}
/** Lazy resource in the current request only, never changes the app's shared pool options. */
export function scopedBudgetPool(factory: (budget: ExecutionBudget) => Pool): Pool | undefined {
  const scope = context.getStore(); if (!scope) return undefined;
  scope.pool ??= factory(scope.budget); return scope.pool;
}
/** Caller retains this signal until the response body has completed. */
export function requestSignal(maxMs: number, budget = currentExecutionBudget()) {
  assertExecutionBudget(budget);
  const controller = new AbortController();
  const abort = () => controller.abort(new BudgetExhausted());
  budget?.signal.addEventListener("abort",abort,{once:true});
  const timer = setTimeout(()=>controller.abort(),Math.min(maxMs,budget?.remainingMs() ?? maxMs)); timer.unref?.();
  return { signal: controller.signal, dispose:()=>{clearTimeout(timer);budget?.signal.removeEventListener("abort",abort);} };
}
