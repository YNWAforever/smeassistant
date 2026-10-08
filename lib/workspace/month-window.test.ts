import { expect, it } from "vitest";
import { monthWindow } from "./month-window";

it.each(["Asia/Hong_Kong", "Asia/Taipei", "UTC", "America/New_York"])("describes both local boundaries for %s", (timezone) => {
  expect(monthWindow("2026-12", timezone)).toEqual({ period: "2026-12", timezone, startLocalDate: "2026-12-01", endLocalDate: "2027-01-01" });
});
it.each(["2026-00", "2026-13", "2026-1", "2026-10Z", " 2026-10", "0000-01"])("rejects malformed period %s", (period) => {
  expect(() => monthWindow(period, "UTC")).toThrow("invalid_month_period");
});
it.each(["", "+08:00", "Hong Kong", "Asia/Hong_Kong "])("rejects non-IANA input %s", (zone) => {
  expect(() => monthWindow("2026-10", zone)).toThrow("invalid_workspace_timezone");
});
