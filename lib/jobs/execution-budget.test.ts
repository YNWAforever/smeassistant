import { afterEach, describe, expect, it, vi } from "vitest";
import { createExecutionBudget, requestSignal, withExecutionBudget, currentExecutionBudget } from "./execution-budget";
afterEach(()=>vi.useRealTimers());
describe("one cancellable monotonic work budget",()=>{
  it("shares elapsed time, reserves five seconds and aborts at 55",async()=>{
    vi.useFakeTimers(); let now=0; const budget=createExecutionBudget({now:()=>now});
    expect(budget.remainingMs()).toBe(55_000); now=40_000; expect(budget.remainingMs()).toBe(15_000);
    now=55_000; expect(budget.remainingMs()).toBe(0); expect(budget.signal.aborted).toBe(true); expect(budget.cleanupRemainingMs()).toBe(5000);
    now=60_000; expect(budget.cleanupRemainingMs()).toBe(0); budget.dispose();
  });
  it("keeps async requests isolated and carries the same budget through awaited steps",async()=>{
    const a=createExecutionBudget(),b=createExecutionBudget();
    await Promise.all([withExecutionBudget(a,async()=>{await Promise.resolve();expect(currentExecutionBudget()).toBe(a);}),withExecutionBudget(b,async()=>{await Promise.resolve();expect(currentExecutionBudget()).toBe(b);})]);
    expect(currentExecutionBudget()).toBeUndefined(); a.dispose();b.dispose();
  });
  it("uses the shorter remaining HTTP time and propagates parent cancellation",async()=>{
    vi.useFakeTimers(); const budget=createExecutionBudget({durationMs:1500}); const request=requestSignal(10_000,budget);
    await vi.advanceTimersByTimeAsync(1500); expect(request.signal.aborted).toBe(true); request.dispose();budget.dispose();
  });
});
