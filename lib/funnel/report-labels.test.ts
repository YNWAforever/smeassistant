import { expect, it } from "vitest";
import { limitationLabel } from "./report-labels";
it.each([
  ["en", "Evidence could not be measured"],
  ["zh-HK", "未能量度這項證據"],
  ["zh-TW", "無法量測這項證據"],
])("keeps unknown provider diagnostics out of owner copy: %s", (locale, label) => {
  expect(limitationLabel(locale, "PROVIDER_INTERNAL_SECRET_DETAIL")).toBe(label);
});
