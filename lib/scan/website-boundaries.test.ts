import { expect, it } from "vitest";
import { parseScanStartBody } from "./start-job";
import { buildScanStartPayload, canStartScan, emptyScanDraft } from "@/lib/funnel/scan-start";
import { LEGAL_POLICY_VERSION } from "@/lib/legal/policy";

const consent = { granted: true, policyVersion: LEGAL_POLICY_VERSION };
function draft(websiteUrl: string) {
  return { ...emptyScanDraft("hk", "Fixture Cafe"), manualEntry: true, industry: "restaurant", district: "Central", websiteUrl };
}
it.each(["not a url", "/relative", "javascript:alert(1)", "ftp://example.test", "https://user:secret@example.test", "https://example.test/" + "a".repeat(2048)])("rejects invalid website before submission: %s", (website) => {
  const body = { business_name: "Fixture Cafe", market: "HK", locale: "en", industry: "restaurant", district: "Central", objective: "more_leads", manual_entry: true, continue_without_place: true, public_evidence_consent: true, consent_policy_version: LEGAL_POLICY_VERSION, website_url: website };
  expect(parseScanStartBody(body)).toEqual({ ok: false, error: "website_url is invalid" });
  expect(canStartScan(draft(website))).toBe(false);
  expect(() => buildScanStartPayload(draft(website), "en", consent)).toThrow("website_url is invalid");
});
it.each([undefined, null, 42, {}, []])("rejects supplied non-string website except missing/null: %s", (website) => {
  const body = { ...buildScanStartPayload(draft(""), "en", consent), website_url: website };
  expect(parseScanStartBody(body).ok).toBe(website == null);
});
it("accepts a blank website and preserves valid path/query", () => {
  expect(buildScanStartPayload(draft("  "), "en", consent).website_url).toBeUndefined();
  const url = "https://example.test/menu?lang=zh-HK&day=1";
  const payload = buildScanStartPayload(draft(` ${url} `), "en", consent);
  expect(payload.website_url).toBe(url);
  const parsed = parseScanStartBody(payload);
  expect(parsed.ok && parsed.input.websiteUrl).toBe(url);
});
