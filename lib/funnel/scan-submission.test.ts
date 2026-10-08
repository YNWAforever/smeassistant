import { describe, expect, it } from "vitest";
import { SCAN_SUBMISSION_STORAGE_KEY, SCAN_SUBMISSION_TTL_MS, forgetScanSubmissionKey, layeredSubmissionStorage, scanSubmissionKeyFor } from "./scan-start";

/** F-13: one key per submission, reused only for a retry of the identical payload. */
function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
}
const payload = { business_name: "Fixture", market: "HK" } as unknown as Parameters<typeof scanSubmissionKeyFor>[0];
let n = 0;
const mint = () => `key-${++n}-${"x".repeat(30)}`;

describe("scanSubmissionKeyFor", () => {
  it("reuses the key for a retry of the identical payload, across a remount", () => {
    const storage = memoryStorage();
    const first = scanSubmissionKeyFor(payload, storage, 1_000, mint);
    expect(scanSubmissionKeyFor(payload, storage, 2_000, mint)).toBe(first);
    expect(scanSubmissionKeyFor({ ...payload }, storage, 3_000, mint)).toBe(first);
  });

  it("mints a new key when anything in the submission changes", () => {
    const storage = memoryStorage();
    const first = scanSubmissionKeyFor(payload, storage, 1_000, mint);
    expect(scanSubmissionKeyFor({ ...payload, business_name: "Other" }, storage, 1_500, mint)).not.toBe(first);
  });

  it("mints a new key once the stored one is older than the window, or from the future", () => {
    const storage = memoryStorage();
    const first = scanSubmissionKeyFor(payload, storage, 1_000, mint);
    expect(scanSubmissionKeyFor(payload, storage, 1_000 + SCAN_SUBMISSION_TTL_MS, mint)).not.toBe(first);
    const second = scanSubmissionKeyFor(payload, storage, 5_000_000, mint);
    expect(scanSubmissionKeyFor(payload, storage, 4_000_000, mint)).not.toBe(second);
  });

  it("still returns a usable key when storage is missing, throws or holds garbage", () => {
    expect(scanSubmissionKeyFor(payload, null, 1, mint)).toMatch(/^key-/);
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(scanSubmissionKeyFor(payload, throwing, 1, mint)).toMatch(/^key-/);
    const garbage = memoryStorage(); garbage.setItem(SCAN_SUBMISSION_STORAGE_KEY, "{not json");
    expect(scanSubmissionKeyFor(payload, garbage, 1, mint)).toMatch(/^key-/);
  });

  it("forgets the stored key", () => {
    const storage = memoryStorage();
    const first = scanSubmissionKeyFor(payload, storage, 1_000, mint);
    forgetScanSubmissionKey(storage);
    expect(scanSubmissionKeyFor(payload, storage, 1_001, mint)).not.toBe(first);
  });
});

describe("layeredSubmissionStorage", () => {
  it("keeps a retry key in memory when session storage refuses every call", () => {
    const denied = () => { throw new Error("SecurityError"); };
    const storage = layeredSubmissionStorage(new Map(), () => ({ getItem: denied, setItem: denied, removeItem: denied }));
    const first = scanSubmissionKeyFor(payload, storage, 1_000, mint);
    expect(scanSubmissionKeyFor(payload, storage, 2_000, mint)).toBe(first);
  });
  it("prefers session storage so a refreshed page finds the key", () => {
    const tab = memoryStorage();
    const first = scanSubmissionKeyFor(payload, layeredSubmissionStorage(new Map(), () => tab), 1_000, mint);
    expect(scanSubmissionKeyFor(payload, layeredSubmissionStorage(new Map(), () => tab), 2_000, mint)).toBe(first);
  });
});
