import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { publicPageMetadata } from "@/app/[locale]/_meta";
import { demoWorkspaceTitle, seoDescription } from "@/lib/seo-copy";

const LOCALES = ["en", "zh-HK", "zh-TW"] as const;
const PAGES = ["landing", "scan", "sample", "pricing", "methodology", "trust"] as const;

/**
 * Descriptions used to be stitched from on-page fragments, which leaked raw
 * placeholders into search results ("Prices shown in {currency} for the
 * {market} market…") and ran past the ~160 characters a result shows.
 */
describe("public page metadata", () => {
  it.each(LOCALES)("has no unfilled placeholder in any title or description (%s)", (locale) => {
    for (const page of PAGES) {
      const meta = publicPageMetadata(locale, page);
      expect(String(meta.description), `${locale} ${page}`).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(JSON.stringify(meta.title ?? ""), `${locale} ${page}`).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  it("keeps English descriptions within what a search result shows", () => {
    for (const page of PAGES) expect(String(publicPageMetadata("en", page).description).length, page).toBeLessThanOrEqual(165);
  });

  it.each(LOCALES)("gives the sample report and the demo workspace their own description and title (%s)", (locale) => {
    expect(seoDescription(locale, "sample")).not.toBe(seoDescription(locale, "demoWorkspace"));
    expect(demoWorkspaceTitle(locale).length).toBeGreaterThan(0);
  });
});
