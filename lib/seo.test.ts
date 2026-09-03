import { describe, expect, it } from "vitest";
import { localeAlternates } from "./seo";

describe("localeAlternates", () => {
  it("prefixes every served locale, including the default one", () => {
    const alt = localeAlternates("/r/abc");
    // Unlike upstream (localePrefix: "as-needed"), this app prefixes every
    // locale; an unprefixed href would point at a 307 from proxy.ts.
    expect(alt.languages["zh-HK"]).toBe("/zh-HK/r/abc");
    expect(alt.languages["en"]).toBe("/en/r/abc");
    expect(alt.languages["zh-TW"]).toBe("/zh-TW/r/abc");
    expect(alt.languages["x-default"]).toBe("/zh-HK/r/abc");
  });

  it("prefixes the site root without emitting a trailing slash", () => {
    const alt = localeAlternates("/");
    expect(alt.languages["zh-HK"]).toBe("/zh-HK");
    expect(alt.languages["en"]).toBe("/en");
    expect(alt.languages["x-default"]).toBe("/zh-HK");
  });

  it("leaves an already-prefixed path alone", () => {
    expect(localeAlternates("/en/pricing").languages["en"]).toBe("/en/pricing");
  });
});
