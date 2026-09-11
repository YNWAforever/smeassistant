import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  CLOCK_SKEW_TOLERANCE_MS,
  INITIAL_POLL_DELAY_MS,
  MAX_CONSECUTIVE_POLL_ERRORS,
  MAX_POLL_ATTEMPTS,
  MAX_POLL_DURATION_MS,
  POLL_RECORD_MAX_AGE_MS,
  SCAN_RECLAIM_WINDOW_MINUTES,
  SLOW_POLL_AFTER_MS,
  advancePollLoop,
  clearPollRecord,
  collectorPhases,
  coveragePercent,
  formatElapsed,
  initialPollLoopState,
  isPollBudgetExhausted,
  nextPollDelay,
  pollRecordKey,
  readPollRecord,
  scanViewState,
  shouldCatchUp,
  stallCollectorPhases,
  writePollRecord,
  type PollLoopState,
  type PollRecordStorage,
} from "./scan-progress";

function fakeStorage(): PollRecordStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const throwingStorage: PollRecordStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => { throw new Error("blocked"); },
};

const state = (over: Partial<PollLoopState> = {}): PollLoopState => ({ ...initialPollLoopState(), ...over });

describe("coveragePercent", () => {
  it("renders a 0-1 fraction as a whole percentage", () => {
    expect(coveragePercent(0.5)).toBe(50);
    expect(coveragePercent(0.7)).toBe(70);
    expect(coveragePercent(1)).toBe(100);
    expect(coveragePercent(0)).toBe(0);
  });
  it("passes an already-a-percentage value through unchanged", () => {
    expect(coveragePercent(70)).toBe(70);
  });
  it("returns null for null or non-finite input", () => {
    expect(coveragePercent(null)).toBeNull();
    expect(coveragePercent(NaN)).toBeNull();
  });
  it("clamps an out-of-range already-a-percentage value to 100", () => {
    expect(coveragePercent(150)).toBe(100);
  });
});

describe("collectorPhases", () => {
  it("uses real per-module states on a partial job instead of a blanket phase", () => {
    const phases = collectorPhases(null, "partial", { google_business: "measured", instagram: "unavailable", search_ai: "failed" });
    expect(phases).toEqual({ google_business: "done", instagram: "unavailable", search_ai: "failed" });
  });
  it("uses real per-module states on a done job too", () => {
    const phases = collectorPhases(null, "done", { google_business: "measured", instagram: "measured", search_ai: "measured" });
    expect(phases).toEqual({ google_business: "done", instagram: "done", search_ai: "done" });
  });
  it("falls back to an honest 'unavailable' blanket on a partial job with no module states available", () => {
    expect(collectorPhases(null, "partial")).toEqual({ google_business: "unavailable", instagram: "unavailable", search_ai: "unavailable" });
  });
  it("honors real mixed per-module states even when the overall scan status is failed", () => {
    expect(collectorPhases(null, "failed", { google_business: "measured", instagram: "unavailable", search_ai: "failed" })).toEqual({
      google_business: "done", instagram: "unavailable", search_ai: "failed",
    });
  });
  it("falls back to a blanket failed phase on outright failure with no module states available", () => {
    expect(collectorPhases(null, "failed")).toEqual({ google_business: "failed", instagram: "failed", search_ai: "failed" });
  });
  it("uses the coarser stage-based phase while the scan is still running", () => {
    expect(collectorPhases("collecting_ig_gbp", "collecting_ig_gbp")).toEqual({ google_business: "running", instagram: "running", search_ai: "pending" });
  });
});

describe("nextPollDelay tiering", () => {
  it("keeps the original ladder when no elapsed time is supplied", () => {
    expect(nextPollDelay(1000)).toBe(1500);
    expect(nextPollDelay(8000)).toBe(8000);
  });
  it("drops to the slow cadence once fast polling buys nothing", () => {
    expect(nextPollDelay(8000, SLOW_POLL_AFTER_MS)).toBe(12000);
    expect(nextPollDelay(16000, SLOW_POLL_AFTER_MS)).toBe(24000);
    expect(nextPollDelay(30000, SLOW_POLL_AFTER_MS)).toBe(30000);
  });
});

describe("isPollBudgetExhausted", () => {
  it("binds on whichever of attempts or duration runs out first", () => {
    expect(isPollBudgetExhausted(1, 0)).toBe(false);
    expect(isPollBudgetExhausted(MAX_POLL_ATTEMPTS - 1, MAX_POLL_DURATION_MS - 1)).toBe(false);
    expect(isPollBudgetExhausted(MAX_POLL_ATTEMPTS, 0)).toBe(true);
    expect(isPollBudgetExhausted(1, MAX_POLL_DURATION_MS)).toBe(true);
  });
});

describe("polling budget sizing", () => {
  it("spends few enough requests that a mid-scan re-check cannot 429 the user", () => {
    // Walk the real schedule: first poll at INITIAL_POLL_DELAY_MS, then each
    // delay derived from the previous one and the elapsed time.
    let elapsed = INITIAL_POLL_DELAY_MS;
    let delay = INITIAL_POLL_DELAY_MS;
    let attempts = 1;
    while (!isPollBudgetExhausted(attempts, elapsed)) {
      delay = nextPollDelay(delay, elapsed);
      elapsed += delay;
      attempts += 1;
    }
    // The duration budget binds first; the attempt cap stays a backstop.
    expect(attempts).toBeLessThanOrEqual(MAX_POLL_ATTEMPTS);
    // Two full budgets (one page load plus one manual re-check) still fit under
    // the limiter. Multi-tab budget sharing is out of scope, so this is the
    // single-tab guarantee.
    expect(attempts * 2).toBeLessThanOrEqual(RATE_LIMITS.scan_status.limit);
  });
});

describe("advancePollLoop", () => {
  it("stops on a terminal status and never reports it as stalled", () => {
    expect(advancePollLoop(initialPollLoopState(), { kind: "status", status: "done" }, 0)).toMatchObject({ terminal: true, stalledReason: null, attempt: 1 });
  });
  it("keeps polling on a healthy non-terminal status and backs off", () => {
    const next = advancePollLoop(initialPollLoopState(), { kind: "status", status: "collecting" }, 0);
    expect(next).toMatchObject({ terminal: false, stalledReason: null, attempt: 1 });
    expect(next.delayMs).toBeGreaterThan(INITIAL_POLL_DELAY_MS);
  });
  it("stalls with a timeout once either half of the budget is spent", () => {
    expect(advancePollLoop(initialPollLoopState(), { kind: "status", status: "collecting" }, MAX_POLL_DURATION_MS).stalledReason).toBe("timeout");
    expect(advancePollLoop(state({ attempt: MAX_POLL_ATTEMPTS - 1 }), { kind: "status", status: "collecting" }, 0).stalledReason).toBe("timeout");
  });
  it("treats 404 and 400 as permanent for this job id", () => {
    expect(advancePollLoop(initialPollLoopState(), { kind: "http", httpStatus: 404 }, 0).stalledReason).toBe("missing");
    expect(advancePollLoop(initialPollLoopState(), { kind: "http", httpStatus: 400 }, 0).stalledReason).toBe("missing");
  });
  it("stops immediately on 429 rather than burning an exhausted bucket", () => {
    expect(advancePollLoop(initialPollLoopState(), { kind: "http", httpStatus: 429 }, 0).stalledReason).toBe("rateLimited");
  });
  it("tolerates a run of transient failures and stalls only at the cap", () => {
    let loop = initialPollLoopState();
    for (let i = 0; i < MAX_CONSECUTIVE_POLL_ERRORS - 1; i += 1) {
      loop = advancePollLoop(loop, { kind: "http", httpStatus: 503 }, 0);
      expect(loop.stalledReason).toBeNull();
    }
    expect(advancePollLoop(loop, { kind: "network" }, 0).stalledReason).toBe("unreachable");
  });
  it("resets the error run on a successful read", () => {
    let loop = advancePollLoop(initialPollLoopState(), { kind: "http", httpStatus: 503 }, 0);
    loop = advancePollLoop(loop, { kind: "status", status: "collecting" }, 0);
    expect(loop.consecutiveErrors).toBe(0);
    loop = advancePollLoop(loop, { kind: "http", httpStatus: 503 }, 0);
    expect(loop.stalledReason).toBeNull();
  });
  it("lets a healthy answer clear a stall, so the card never contradicts the progress bar", () => {
    const next = advancePollLoop(state({ stalledReason: "unreachable", consecutiveErrors: 4 }), { kind: "status", status: "scoring" }, 0);
    expect(next.stalledReason).toBeNull();
    expect(next.terminal).toBe(false);
  });
  it("never un-says missing, because that job id will not appear later", () => {
    expect(advancePollLoop(state({ stalledReason: "missing" }), { kind: "status", status: "collecting" }, 0).stalledReason).toBe("missing");
  });
  it("lets a terminal status rescue an already-stalled loop", () => {
    expect(advancePollLoop(state({ stalledReason: "timeout" }), { kind: "status", status: "partial" }, MAX_POLL_DURATION_MS * 2)).toMatchObject({ terminal: true, stalledReason: null });
  });
});

describe("shouldCatchUp", () => {
  it("spends a catch-up request only where one could change the answer", () => {
    expect(shouldCatchUp(initialPollLoopState())).toBe(true);
    expect(shouldCatchUp(state({ stalledReason: "timeout" }))).toBe(true);
    expect(shouldCatchUp(state({ terminal: true }))).toBe(false);
    expect(shouldCatchUp(state({ stalledReason: "missing" }))).toBe(false);
    expect(shouldCatchUp(state({ stalledReason: "rateLimited" }))).toBe(false);
  });
});

describe("scanViewState", () => {
  it("lets terminal truth outrank a stalled verdict", () => {
    expect(scanViewState({ status: "failed", stalledReason: "timeout" })).toBe("failed");
    expect(scanViewState({ status: "done", stalledReason: "timeout" })).toBe("ready");
    expect(scanViewState({ status: "partial", stalledReason: null })).toBe("ready");
    expect(scanViewState({ status: "collecting", stalledReason: "unreachable" })).toBe("stalled");
    expect(scanViewState({ status: "queued", stalledReason: null })).toBe("running");
  });
});

describe("stallCollectorPhases", () => {
  it("marks only what was still in flight, leaving resolved outcomes alone", () => {
    expect(stallCollectorPhases({ google_business: "running", instagram: "pending", search_ai: "done" })).toEqual({
      google_business: "stalled",
      instagram: "stalled",
      search_ai: "done",
    });
    expect(stallCollectorPhases({ google_business: "unavailable", instagram: "failed", search_ai: "done" })).toEqual({
      google_business: "unavailable",
      instagram: "failed",
      search_ai: "done",
    });
  });
});

describe("poll record", () => {
  const now = 1_700_000_000_000;
  it("creates and persists a record on the first read", () => {
    const storage = fakeStorage();
    expect(readPollRecord("job-1", storage, now)).toEqual({ startedAt: now, budgetStartedAt: now, lastProcessAt: 0, lastPollAt: 0 });
    expect(JSON.parse(storage.map.get(pollRecordKey("job-1")) ?? "{}")).toMatchObject({ startedAt: now });
  });
  it("does not let a refresh buy a fresh budget", () => {
    const storage = fakeStorage();
    readPollRecord("job-1", storage, now);
    const again = readPollRecord("job-1", storage, now + 60_000);
    expect(again.startedAt).toBe(now);
    expect(again.budgetStartedAt).toBe(now);
  });
  it("re-arms the budget for a genuine return visit without rewriting the elapsed clock", () => {
    const storage = fakeStorage();
    writePollRecord("job-1", storage, { startedAt: now, budgetStartedAt: now, lastProcessAt: now, lastPollAt: now });
    const later = now + MAX_POLL_DURATION_MS + 60_000;
    const record = readPollRecord("job-1", storage, later);
    expect(record.startedAt).toBe(now);
    expect(record.budgetStartedAt).toBe(later);
  });
  it("replaces a record the clock or the calendar has invalidated", () => {
    const storage = fakeStorage();
    writePollRecord("job-1", storage, { startedAt: now + CLOCK_SKEW_TOLERANCE_MS + 1000, budgetStartedAt: now, lastProcessAt: 0, lastPollAt: 0 });
    expect(readPollRecord("job-1", storage, now).startedAt).toBe(now);
    writePollRecord("job-2", storage, { startedAt: now - POLL_RECORD_MAX_AGE_MS - 1000, budgetStartedAt: now, lastProcessAt: 0, lastPollAt: 0 });
    expect(readPollRecord("job-2", storage, now).startedAt).toBe(now);
  });
  it("replaces malformed or non-numeric values instead of throwing into a render", () => {
    const storage = fakeStorage();
    storage.map.set(pollRecordKey("job-1"), "not json");
    expect(readPollRecord("job-1", storage, now).startedAt).toBe(now);
    storage.map.set(pollRecordKey("job-2"), JSON.stringify({ startedAt: "soon", budgetStartedAt: now }));
    expect(readPollRecord("job-2", storage, now).startedAt).toBe(now);
  });
  it("survives storage being absent or blocked", () => {
    expect(readPollRecord("job-1", null, now)).toEqual({ startedAt: now, budgetStartedAt: now, lastProcessAt: 0, lastPollAt: 0 });
    expect(readPollRecord("job-1", throwingStorage, now).startedAt).toBe(now);
    expect(() => writePollRecord("job-1", throwingStorage, { startedAt: now, budgetStartedAt: now, lastProcessAt: 0, lastPollAt: 0 })).not.toThrow();
    expect(() => clearPollRecord("job-1", throwingStorage)).not.toThrow();
    expect(() => clearPollRecord("job-1", null)).not.toThrow();
  });
  it("round-trips and clears under the job's own key", () => {
    const storage = fakeStorage();
    const record = { startedAt: now, budgetStartedAt: now, lastProcessAt: now, lastPollAt: now };
    writePollRecord("job-1", storage, record);
    expect(readPollRecord("job-1", storage, now)).toEqual(record);
    clearPollRecord("job-1", storage);
    expect(storage.map.has(pollRecordKey("job-1"))).toBe(false);
  });
});

describe("formatElapsed", () => {
  it("splits seconds into minutes and seconds and never goes negative", () => {
    expect(formatElapsed(45)).toEqual({ minutes: 0, seconds: 45 });
    expect(formatElapsed(95)).toEqual({ minutes: 1, seconds: 35 });
    expect(formatElapsed(3605)).toEqual({ minutes: 60, seconds: 5 });
    expect(formatElapsed(-1)).toEqual({ minutes: 0, seconds: 0 });
  });
});

describe("reclaim window honesty", () => {
  it("keeps the minutes the stalled copy quotes in step with the claim SQL", () => {
    const source = readFileSync(fileURLToPath(new URL("../scan/execution-store.ts", import.meta.url)), "utf8");
    expect(source).toContain(`interval '${SCAN_RECLAIM_WINDOW_MINUTES} minutes'`);
  });
});
