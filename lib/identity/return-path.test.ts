import { expect, it } from "vitest";
import { safeReturnPath } from "./return-path";
it.each(["//evil.example", "https://evil.example", "/\\evil.example", "/%2fevil.example", "/%252fevil.example", "/%5cevil.example", "/en/%0d%0aevil", "/en/\u0000", "owner", "", "/%zz"])("rejects unsafe return %s", value => {
  expect(safeReturnPath(value, "/en/owner")).toBe("/en/owner");
});
it.each(["/zh-HK/owner", "/zh-TW/owner/x?location=123&action=edit", "/en/owner", "/en/owner/acme?name=Kam%20Man"])("preserves local context %s", value => {
  expect(safeReturnPath(value, "/en/owner")).toBe(value);
});
