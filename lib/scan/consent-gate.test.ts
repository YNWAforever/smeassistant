import { describe, expect, it, vi } from "vitest";
import { LEGAL_POLICY_VERSION } from "@/lib/legal/policy";
import { assertScanConsent } from "./consent-gate";

const deps = (row: { granted: boolean; policy_version: string } | null | Error) => ({
  readScanConsent: vi.fn(async () => {
    if (row instanceof Error) throw row;
    return row;
  }),
  failQueued: vi.fn(async () => true),
});

describe("assertScanConsent", () => {
  it("lets a consented job through without touching it", async () => {
    const d = deps({ granted: true, policy_version: LEGAL_POLICY_VERSION });
    expect(await assertScanConsent("job-1", d)).toEqual({ ok: true });
    expect(d.failQueued).not.toHaveBeenCalled();
  });

  it("fails a job with no consent row before a single provider call", async () => {
    const d = deps(null);
    const result = await assertScanConsent("job-1", d);
    expect(result).toMatchObject({ ok: false, code: "consent_required", status: 403 });
    expect(d.failQueued).toHaveBeenCalledWith("job-1", "consent_missing", (result as { correlationId: string }).correlationId);
  });

  it("fails a job whose consent was withdrawn", async () => {
    const d = deps({ granted: false, policy_version: LEGAL_POLICY_VERSION });
    expect(await assertScanConsent("job-1", d)).toMatchObject({ ok: false, code: "consent_required" });
    expect(d.failQueued).toHaveBeenCalledWith("job-1", "consent_missing", expect.any(String));
  });

  it("fails a job consented against a version we no longer publish", async () => {
    const d = deps({ granted: true, policy_version: "2026-07-14" });
    const result = await assertScanConsent("job-1", d);
    expect(result).toMatchObject({ ok: false, code: "consent_policy_stale", status: 403 });
    expect(d.failQueued).toHaveBeenCalledWith("job-1", "consent_policy_stale", (result as { correlationId: string }).correlationId);
  });

  it("never burns a scan on a transient database fault", async () => {
    const d = deps(new Error("connection reset"));
    expect(await assertScanConsent("job-1", d)).toEqual({ ok: false, code: "unavailable", status: 503 });
    expect(d.failQueued).not.toHaveBeenCalled();
  });
});
