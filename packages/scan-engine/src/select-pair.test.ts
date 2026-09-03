import { describe, expect, it } from "vitest";
import { selectBaseJob, type PairCandidate } from "./select-pair";

function candidate(overrides: Partial<PairCandidate> = {}): PairCandidate {
  return {
    id: "job-old",
    status: "done",
    created_at: "2026-07-15T01:00:00.000Z",
    ...overrides,
  };
}

const HEAD = { id: "job-new", created_at: "2026-08-15T01:00:00.000Z" };

describe("selectBaseJob", () => {
  it("returns null when the merchant has no earlier scan", () => {
    expect(selectBaseJob(HEAD, [])).toBeNull();
  });

  it("picks the most recent earlier scan", () => {
    const rows = [
      candidate({ id: "june", created_at: "2026-06-15T01:00:00.000Z" }),
      candidate({ id: "july", created_at: "2026-07-15T01:00:00.000Z" }),
    ];
    expect(selectBaseJob(HEAD, rows)).toBe("july");
  });

  it("never compares a scan with itself", () => {
    const rows = [candidate({ id: HEAD.id, created_at: HEAD.created_at })];
    expect(selectBaseJob(HEAD, rows)).toBeNull();
  });

  it("ignores scans newer than the head", () => {
    // Re-processing an older job must not compare it against a later month.
    const rows = [candidate({ id: "future", created_at: "2026-09-15T01:00:00.000Z" })];
    expect(selectBaseJob(HEAD, rows)).toBeNull();
  });

  it("ignores a scan that never produced a result", () => {
    const rows = [
      candidate({ id: "failed", status: "failed", created_at: "2026-08-01T01:00:00.000Z" }),
      candidate({ id: "july", created_at: "2026-07-15T01:00:00.000Z" }),
    ];
    expect(selectBaseJob(HEAD, rows)).toBe("july");
  });

  it("accepts a partial scan as a base", () => {
    // The engine intersects measured modules itself; a partial scan still has
    // real measurements worth comparing.
    const rows = [candidate({ id: "partial", status: "partial" })];
    expect(selectBaseJob(HEAD, rows)).toBe("partial");
  });

  it("ignores an unfinished scan", () => {
    const rows = [candidate({ id: "running", status: "collecting" })];
    expect(selectBaseJob(HEAD, rows)).toBeNull();
  });
});
