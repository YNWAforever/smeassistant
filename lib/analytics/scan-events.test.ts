import { describe, expect, it, vi } from "vitest";
import {
  SCAN_EVENT_LOCK_TIMEOUT,
  SCAN_STARTED_DEDUPE_KEY,
  SCAN_TERMINAL_DEDUPE_KEY,
  insertScanEvent,
  scanCompletedEvent,
  scanStartedEvent,
  writeScanEventSafely,
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
  // key never conflicts. A fixed non-null key makes a same-session repeat
  // idempotent; the session is part of the index, so it does nothing across
  // sessions.
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

describe("writeScanEventSafely", () => {
  const write = {
    jobId: "job-1",
    anonymousSessionId: "session-1",
    event: scanCompletedEvent("done", 0.5),
    dedupeKey: SCAN_TERMINAL_DEDUPE_KEY,
  };

  it("bounds the insert with a lock timeout inside a savepoint and releases it on success", async () => {
    const query = vi.fn<(sql: string) => Promise<{ rows: never[] }>>(async () => ({ rows: [] }));
    expect(await writeScanEventSafely({ query } as never, write)).toBe(true);
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(SCAN_EVENT_LOCK_TIMEOUT).toBe("500ms");
    expect(statements[0]).toBe("SAVEPOINT scan_event");
    expect(statements[1]).toBe("SET LOCAL lock_timeout = '500ms'");
    expect(statements[2]).toMatch(/INSERT INTO scan_events/);
    expect(statements[3]).toBe("RELEASE SAVEPOINT scan_event");
    expect(statements).toHaveLength(4);
  });

  it("rolls back to and releases the savepoint, logs the job and SQLSTATE only, and reports false", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO scan_events")) {
        throw Object.assign(new Error("permission denied for table scan_events"), { code: "42501" });
      }
      return { rows: [] };
    });
    try {
      expect(await writeScanEventSafely({ query } as never, write)).toBe(false);
      expect(query.mock.calls.map(([sql]) => sql).slice(-2)).toEqual([
        "ROLLBACK TO SAVEPOINT scan_event",
        "RELEASE SAVEPOINT scan_event",
      ]);
      // Exactly these fields: no error message, no SQL.
      expect(log).toHaveBeenCalledWith("[analytics] event_record_failed", {
        category: "event_write_failed",
        event: "scan_completed",
        jobId: "job-1",
        code: "42501",
      });
    } finally {
      log.mockRestore();
    }
  });

  it("logs no code when the failure carries no SQLSTATE", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO scan_events")) throw new Error("socket closed");
      return { rows: [] };
    });
    try {
      expect(await writeScanEventSafely({ query } as never, write)).toBe(false);
      expect(log).toHaveBeenCalledWith("[analytics] event_record_failed", {
        category: "event_write_failed",
        event: "scan_completed",
        jobId: "job-1",
        code: undefined,
      });
    } finally {
      log.mockRestore();
    }
  });

  it("propagates a failure of the savepoint statement itself", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "SAVEPOINT scan_event") throw new Error("connection lost");
      return { rows: [] };
    });
    await expect(writeScanEventSafely({ query } as never, write)).rejects.toThrow("connection lost");
  });
});
