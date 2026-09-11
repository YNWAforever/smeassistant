import { expect, it } from "vitest";
import { buildScanStartPayload, emptyScanDraft } from "@/lib/funnel/scan-start";
import { LEGAL_POLICY_VERSION } from "@/lib/legal/policy";
import { parseScanStartBody } from "@/lib/scan/start-job";

it.each(["hk", "tw"] as const)("accepts the %s browser manual-entry payload at the server boundary", (market) => {
  const draft = { ...emptyScanDraft(market, "Fixture shop"), manualEntry: true, industry: "fnb", district: market === "hk" ? "東區" : "臺北市" };
  const payload = buildScanStartPayload(draft, market === "hk" ? "zh-HK" : "zh-TW", { granted: true, policyVersion: LEGAL_POLICY_VERSION });
  expect(parseScanStartBody(payload)).toMatchObject({ ok: true, input: { manualEntry: true, provider: null, placeId: null, market: market.toUpperCase() } });
  expect(parseScanStartBody({ ...payload, continue_without_place: false })).toMatchObject({ ok: false });
  // The whole point of the item: the browser payload cannot be stripped of
  // consent, or pointed at a version we never published, at the server boundary.
  expect(parseScanStartBody({ ...payload, public_evidence_consent: undefined })).toMatchObject({ ok: false });
  expect(parseScanStartBody({ ...payload, consent_policy_version: "2026-07-14" })).toMatchObject({ ok: false, status: 409 });
});