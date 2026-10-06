import { expect, it } from "vitest";
import { parseVersionMeta } from "./version-meta";
import { guardrailText } from "./guardrail-text";
it.each([
  ["en", "amount or currency", "start and end dates"],
  ["zh-HK", "金額或貨幣", "起訖日期"],
  ["zh-TW", "金額或幣別", "起訖日期"],
] as const)("surfaces deterministic offer warnings with actionable localized copy: %s", (locale, price, dates) => {
  const meta = parseVersionMeta({ warnings: ["offer_price_mismatch", "offer_dates_missing", "offer_prohibited_term"] }, "agent");
  expect(meta.guardrails.map(flag => flag.code)).toEqual(["offer_price_mismatch", "offer_dates_missing", "offer_prohibited_term"]);
  expect(meta.agentNotes).toEqual([]);
  expect(guardrailText(meta.guardrails[0], locale)).toContain(price);
  expect(guardrailText(meta.guardrails[1], locale)).toContain(dates);
});
