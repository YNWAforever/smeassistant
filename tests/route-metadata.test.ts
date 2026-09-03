import { describe, expect, it } from "vitest";

import { publicAlternates, publicPageMetadata } from "@/app/[locale]/_meta";
import { firstParam, resolveMarketParam } from "@/app/[locale]/_params";
import { supportedLocales } from "@/lib/copy";

/**
 * `lib/seo.ts` was ported from upstream, where the default locale is served
 * unprefixed (`localePrefix: "as-needed"`). Every locale is prefixed here
 * (CLAUDE.md §3.1), so the segment metadata re-prefixes what it returns. These
 * cases exist so a future edit to lib/seo.ts cannot silently emit hreflang
 * links that 307 on every hit.
 */
describe("publicAlternates", () => {
  it("prefixes every locale, including the default and x-default", () => {
    const alternates = publicAlternates("en", "/pricing");
    expect(alternates?.canonical).toBe("/en/pricing");
    expect(alternates?.languages).toMatchObject({
      "zh-HK": "/zh-HK/pricing",
      en: "/en/pricing",
      "zh-TW": "/zh-TW/pricing",
      "x-default": "/zh-HK/pricing",
    });
  });

  it("keeps the landing page free of a trailing slash", () => {
    const alternates = publicAlternates("zh-TW", "/");
    expect(alternates?.canonical).toBe("/zh-TW");
    expect(alternates?.languages?.["zh-HK"]).toBe("/zh-HK");
    expect(alternates?.languages?.["x-default"]).toBe("/zh-HK");
  });
});

describe("publicPageMetadata", () => {
  const pages = ["landing", "scan", "sample", "pricing", "methodology", "trust"] as const;

  it("gives every public page a non-empty title and description in all three locales", () => {
    for (const locale of supportedLocales) {
      for (const page of pages) {
        const metadata = publicPageMetadata(locale, page);
        expect(String(metadata.title).length, `${locale}/${page} title`).toBeGreaterThan(0);
        expect(String(metadata.description).length, `${locale}/${page} description`).toBeGreaterThan(0);
      }
    }
  });

  it("uses different copy per locale so nothing falls back to English", () => {
    const titles = supportedLocales.map((locale) => publicPageMetadata(locale, "pricing").title);
    expect(new Set(titles).size).toBeGreaterThan(1);
  });
});

describe("resolveMarketParam", () => {
  it("accepts both this app's and upstream's casing", () => {
    expect(resolveMarketParam("tw", "zh-HK")).toBe("tw");
    expect(resolveMarketParam("TW", "zh-HK")).toBe("tw");
    expect(resolveMarketParam("hk", "zh-TW")).toBe("hk");
  });

  it("falls back to the locale's market, never overriding an explicit choice", () => {
    expect(resolveMarketParam(undefined, "zh-TW")).toBe("tw");
    expect(resolveMarketParam(undefined, "en")).toBe("hk");
    expect(resolveMarketParam("nonsense", "zh-TW")).toBe("tw");
  });

  it("reads the first value of a repeated query parameter", () => {
    expect(resolveMarketParam(["tw", "hk"], "en")).toBe("tw");
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
