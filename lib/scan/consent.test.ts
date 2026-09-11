import { describe, expect, it } from "vitest";
import { LEGAL_POLICY_VERSION } from "@/lib/legal/policy";
import { currentScanConsentPolicyVersion, parseScanConsent } from "./consent";

const valid = { public_evidence_consent: true, consent_policy_version: LEGAL_POLICY_VERSION };

describe("parseScanConsent", () => {
  it("accepts an explicit grant against the published version", () => {
    expect(parseScanConsent(valid, "en")).toEqual({
      ok: true,
      consent: { consentType: "public_evidence", granted: true, policyVersion: LEGAL_POLICY_VERSION, locale: "en" },
    });
  });

  it("stamps the server-resolved version, never the client's string", () => {
    const env = { REPORT_CONSENT_POLICY_VERSION: "2026-09-01" } as unknown as NodeJS.ProcessEnv;
    const result = parseScanConsent({ ...valid, consent_policy_version: "2026-09-01" }, "zh-HK", env);
    expect(result).toMatchObject({ ok: true, consent: { policyVersion: "2026-09-01" } });
  });

  it("refuses a missing or withheld grant", () => {
    expect(parseScanConsent({ consent_policy_version: LEGAL_POLICY_VERSION }, "en")).toEqual({
      ok: false,
      error: "public evidence consent is required",
      status: 400,
    });
    expect(parseScanConsent({ ...valid, public_evidence_consent: false }, "en")).toMatchObject({ ok: false, status: 400 });
    // Only a literal true counts: a truthy string is not a consenting act.
    expect(parseScanConsent({ ...valid, public_evidence_consent: "yes" }, "en")).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a missing or blank policy version", () => {
    expect(parseScanConsent({ public_evidence_consent: true }, "en")).toEqual({
      ok: false,
      error: "consent_policy_version is required",
      status: 400,
    });
    expect(parseScanConsent({ ...valid, consent_policy_version: "   " }, "en")).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a version this deployment does not publish", () => {
    expect(parseScanConsent({ ...valid, consent_policy_version: "2026-07-14" }, "en")).toEqual({
      ok: false,
      error: "consent_policy_stale",
      status: 409,
    });
  });
});

describe("currentScanConsentPolicyVersion", () => {
  it("honours an override and treats a blank one as unset", () => {
    expect(currentScanConsentPolicyVersion({ REPORT_CONSENT_POLICY_VERSION: "2026-09-01" } as unknown as NodeJS.ProcessEnv)).toBe("2026-09-01");
    // The `??`-trap documented in lib/leads/consent.ts: an empty string is
    // "not set", not "the empty version".
    expect(currentScanConsentPolicyVersion({ REPORT_CONSENT_POLICY_VERSION: "" } as unknown as NodeJS.ProcessEnv)).toBe(LEGAL_POLICY_VERSION);
    expect(currentScanConsentPolicyVersion({} as unknown as NodeJS.ProcessEnv)).toBe(LEGAL_POLICY_VERSION);
  });
});
