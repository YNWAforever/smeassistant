import { expect, it } from "vitest";
import { parseOptionalWebsiteUrl, resolveScanWebsite } from "./website-url";

it.each([undefined, null, "", "  "])("allows optional blank URL: %s", (value) => expect(parseOptionalWebsiteUrl(value)).toEqual({ ok: true, value: null }));
it.each(["http://example.test", "https://example.test/menu?q=a%20b", "HTTPS://example.test/a"])("preserves valid URL: %s", (value) => expect(parseOptionalWebsiteUrl(` ${value} `)).toEqual({ ok: true, value }));
it.each(["file:///tmp/data", "data:text/plain,x", "javascript:alert(1)"])("rejects unsupported scheme: %s", (value) => expect(parseOptionalWebsiteUrl(value)).toEqual({ ok: false, reason: "unsupported_scheme" }));
it("uses the same 2048-character bound and explicit input precedence", () => {
  const prefix = "https://example.test/";
  const url = prefix + "a".repeat(2048-prefix.length);
  expect(parseOptionalWebsiteUrl(url).ok).toBe(true);
  expect(parseOptionalWebsiteUrl(url+"a")).toEqual({ ok: false, reason: "too_long" });
  expect(resolveScanWebsite({ websiteUrl: "not-a-url", candidate: { websiteUrl: prefix } })).toEqual({ ok: false, reason: "invalid_url" });
  expect(resolveScanWebsite({ websiteUrl: " ", candidate: { websiteUrl: prefix } })).toEqual({ ok: true, value: prefix });
  expect(resolveScanWebsite({ websiteUrl: "", candidate: { websiteUrl: "not-a-url" } }).ok).toBe(false);
});
