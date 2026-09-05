import { expect, it } from "vitest";
import { buildScanStartPayload, emptyScanDraft } from "@/lib/funnel/scan-start";
import { parseScanStartBody } from "@/lib/scan/start-job";

it.each(["hk", "tw"] as const)("accepts the %s browser manual-entry payload at the server boundary", (market) => {
  const draft = { ...emptyScanDraft(market, "Fixture shop"), manualEntry: true, industry: "fnb", district: market === "hk" ? "東區" : "臺北市" };
  const payload = buildScanStartPayload(draft, market === "hk" ? "zh-HK" : "zh-TW");
  expect(parseScanStartBody(payload)).toMatchObject({ ok: true, input: { manualEntry: true, provider: null, placeId: null, market: market.toUpperCase() } });
  expect(parseScanStartBody({ ...payload, continue_without_place: false })).toMatchObject({ ok: false });
});