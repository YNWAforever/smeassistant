import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { getMessages, hasMessage, t } from "@/lib/i18n";

const NAMESPACES = ["scanner", "scanning", "unlock", "report", "share", "legal"];

function readBundle(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../lib/messages/${locale}.json`, import.meta.url)), "utf8"));
}

function keyPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe("lib/messages bundles", () => {
  it("carry exactly the six upstream namespaces this app reuses", () => {
    for (const locale of ["en", "zh-HK", "zh-TW"]) {
      expect(Object.keys(readBundle(locale)).sort()).toEqual([...NAMESPACES].sort());
    }
  });

  it("share one key set across en, zh-HK and zh-TW", () => {
    const en = keyPaths(readBundle("en")).sort();
    expect(en.length).toBeGreaterThan(300);
    expect(keyPaths(readBundle("zh-HK")).sort()).toEqual(en);
    expect(keyPaths(readBundle("zh-TW")).sort()).toEqual(en);
  });

  it("keep every value a non-empty string", () => {
    for (const locale of ["en", "zh-HK", "zh-TW"]) {
      const bundle = readBundle(locale);
      const walk = (value: unknown, path: string) => {
        if (value && typeof value === "object") {
          for (const [key, child] of Object.entries(value as Record<string, unknown>)) walk(child, `${path}.${key}`);
          return;
        }
        expect(typeof value, `${locale}:${path}`).toBe("string");
        expect((value as string).length, `${locale}:${path}`).toBeGreaterThan(0);
      };
      walk(bundle, locale);
    }
  });
});

describe("t()", () => {
  it("resolves dot paths per locale, including nested objects", () => {
    expect(t("en", "report.overallScore")).toBe(getMessages("en").report.overallScore);
    expect(t("zh-HK", "report.overallScore")).toBe(getMessages("zh-HK").report.overallScore);
    expect(t("zh-TW", "report.print.docTitle")).toBe(getMessages("zh-TW").report.print.docTitle);
    expect(t("zh-HK", "report.overallScore")).not.toBe(t("en", "report.overallScore"));
  });

  it("falls back to English, then to the key itself", () => {
    expect(t("zh-HK", "report.doesNotExist")).toBe("report.doesNotExist");
    expect(t("fr", "report.overallScore")).toBe(getMessages("zh-HK").report.overallScore);
    expect(hasMessage("en", "report.print.docTitle")).toBe(true);
    expect(hasMessage("en", "report.print")).toBe(false);
  });

  it("interpolates {token} placeholders", () => {
    expect(t("en", "report.scoreImpactOverall", { value: "-3.8" })).toBe("-3.8 overall");
    expect(t("zh-HK", "scanner.candidateConfidence", { confidence: "高" })).toContain("高");
  });
});
