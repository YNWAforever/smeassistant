import { expect, it } from "vitest";
import { parseReportSlug } from "./slug";

it.each(["3cuOKFmHdiYf00BOs27E_NO1", "Ab_cd-12", "A".repeat(6), "a".repeat(64)])("retains the exact valid report identifier: %s", (value) => {
  expect(parseReportSlug(value)).toBe(value);
});

it.each([undefined, null, 123456, {}, ["abc123"], "short", "a".repeat(65), " abc123", "abc123 ", "abc123\n", "abc/def", "%2Fstaff", "%252Fstaff", "https://fixture.test/r/abc123", "報告abc123"])("rejects invalid report input without trim or decode: %j", (value) => {
  expect(parseReportSlug(value)).toBeNull();
});
