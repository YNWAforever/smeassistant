import { describe, expect, it } from "vitest";
import { localeAlternates } from "./seo";

describe("localeAlternates", () => {
  it("maps every served locale to its prefixed path (default locale unprefixed)", () => {
    const alt = localeAlternates("/r/abc");
    expect(alt.languages["zh-HK"]).toBe("/r/abc"); // default locale, as-needed → no prefix
    expect(alt.languages["en"]).toBe("/en/r/abc");
    expect(alt.languages["zh-TW"]).toBe("/zh-TW/r/abc");
    expect(alt.languages["x-default"]).toBe("/r/abc");
  });
});
