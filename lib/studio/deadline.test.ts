import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioDeadline } from "./deadline";

afterEach(() => vi.useRealTimers());

describe("one Studio turn clock", () => {
  it("charges preflight time to work and keeps finalization alive after work aborts", async () => {
    vi.useFakeTimers();
    const deadline = createStudioDeadline();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(deadline.work.remainingMs()).toBe(38_000);
    expect(deadline.finalization.remainingMs()).toBe(43_000);
    await vi.advanceTimersByTimeAsync(38_000);
    expect(deadline.work.signal.aborted).toBe(true);
    expect(deadline.finalization.signal.aborted).toBe(false);
    expect(deadline.work.cleanupRemainingMs()).toBe(5000);
    expect(deadline.finalization.remainingMs()).toBe(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(deadline.finalization.signal.aborted).toBe(true);
    expect(deadline.work.cleanupRemainingMs()).toBe(0);
    deadline.dispose();
  });

  it("shares an absolute origin even if constructing budget views consumes time", () => {
    vi.useFakeTimers();
    let now = 100;
    const deadline = createStudioDeadline({ now: () => now++ });
    expect(deadline.workDeadlineMs).toBe(50_100);
    expect(deadline.finalDeadlineMs).toBe(55_100);
    now = 50_100;
    expect(deadline.work.remainingMs()).toBe(0);
    now = 55_100;
    expect(deadline.finalization.remainingMs()).toBe(0);
    deadline.dispose();
  });

  it("disposes its timers when a turn finishes early", () => {
    vi.useFakeTimers();
    const deadline = createStudioDeadline();
    deadline.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
