import { describe, expect, it, vi } from "vitest";
import {
  SCAN_STARTED_DEDUPE_KEY,
  SCAN_TERMINAL_DEDUPE_KEY,
  insertScanEvent,
  scanCompletedEvent,
  scanStartedEvent,
} from "./scan-events";

describe("scan event builders", () => {
  it("builds a validated scan_started event", () => {
    expect(scanStartedEvent("HK", "zh-HK")).toEqual({ name: "scan_started", properties: { market: "HK", locale: "zh-HK" } });
  });

  it("rejects a market the engine does not accept, before any transaction opens", () => {
    expect(() => scanStartedEvent("hk", "en")).toThrow();
  });

  it.each(["done", "partial", "failed"] as const)("builds scan_completed for outcome %s", (outcome) => {
    expect(scanCompletedEvent(outcome, 0.5)).toEqual({ name: "scan_completed", properties: { outcome, coverage: 0.5 } });
  });

  it("rejects a non-finite coverage", () => {
    expect(() => scanCompletedEvent("done", Number.NaN)).toThrow();
  });
});

describe("dedupe keys", () => {
  // scan_events_dedupe_identity_unique_idx has no NULLS NOT DISTINCT, so a NULL
  // key never conflicts. A fixed non-null key is what makes a retry idempotent.
  it("are fixed and distinct per event", () => {
    expect(SCAN_STARTED_DEDUPE_KEY).toBe("started");
    expect(SCAN_TERMINAL_DEDUPE_KEY).toBe("terminal");
  });
});

describe("insertScanEvent", () => {
  it("writes on the client it is given, never a pool of its own", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await insertScanEvent({ query } as never, {
      jobId: "job-1",
      anonymousSessionId: "session-1",
      event: scanStartedEvent("TW", "zh-TW"),
      dedupeKey: SCAN_STARTED_DEDUPE_KEY,
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO scan_events/);
    expect(sql).toMatch(/ON CONFLICT\(job_id,anonymous_session_id,event_name,dedupe_key\) DO NOTHING/);
    expect(values).toEqual(["job-1", "session-1", "scan_started", JSON.stringify({ market: "TW", locale: "zh-TW" }), "started"]);
  });
});
