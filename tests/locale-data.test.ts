import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { copy, LOCALE_NAMES, supportedLocales } from "@/lib/copy";
import { localeData as bundled } from "@/lib/locale-data/all";
import { localeData as browser } from "@/lib/locale-data/browser";
import { findLocaleData, localeDataFor, provideLocaleData } from "@/lib/locale-data/registry";
import { t } from "@/lib/i18n";

describe("locale dictionary split", () => {
  it("bundles every locale for the server and tests", () => {
    for (const locale of supportedLocales) {
      expect(bundled[locale]?.copy.language).toBe(LOCALE_NAMES[locale]);
      expect(copy[locale]).toBe(bundled[locale]?.copy);
    }
  });

  it("ships no strings in the browser stand-in", () => {
    expect(browser).toEqual({});
    const source = readFileSync(new URL("../lib/locale-data/browser.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/copy-dictionaries|messages\/|copy-workspace"/);
  });

  it("aliases the full module to the stand-in only for Next's browser bundle", () => {
    const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
    expect(config).toContain('"@/lib/locale-data/all": { browser: "./lib/locale-data/browser.ts" }');
  });

  it("prefers provided dictionaries and reads messages through the same registry", () => {
    const data = bundled["zh-TW"]!;
    provideLocaleData("zh-TW", data);
    expect(localeDataFor("zh-TW")).toBe(data);
    expect(findLocaleData("zh-TW")?.messages).toBe(data.messages);
    expect(t("zh-TW", "report.overallScore")).toBe(t("zh-TW", "report.overallScore"));
  });

  it("names each locale in the picker exactly as its dictionary does", () => {
    for (const locale of supportedLocales) expect(LOCALE_NAMES[locale]).toBe(copy[locale].language);
  });
});
