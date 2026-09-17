import { FINDING_KEYS } from "@sme-scanner/scoring";
import { describe, expect, it } from "vitest";
import { COVERED_FINDING_KEYS, isLedgerOnly, LEDGER_ONLY_KEYS, TEMPLATES, templateByKey, templateForFinding, WEBSITE_FAQ_TRIGGER } from "./templates";
import { WEBSITE_CHECK_KEYS } from "@/lib/website/checks";

describe("action templates", () => {
  it("declares the thirteen templates from CLAUDE.md 3.6.1", () => {
    expect(TEMPLATES.map((t) => t.key)).toEqual([
      "review-response", "review-request", "gbp-profile-fix", "gbp-photo-pack", "gbp-post", "social-post", "ig-bio", "ig-highlights",
      "visibility-content", "website-basics", "local-seo-brief", "menu-translation", "google-reconnect",
    ]);
  });

  it("maps every scorer finding key plus the website trigger to exactly one template or the ledger", () => {
    expect(COVERED_FINDING_KEYS).toHaveLength(FINDING_KEYS.length + 1);
    for (const key of COVERED_FINDING_KEYS) {
      const template = templateForFinding(key);
      const ledger = isLedgerOnly(key);
      expect(Boolean(template) !== ledger, `${key} must be a template or ledger-only, not both or neither`).toBe(true);
    }
    const seen = new Map<string, string>();
    for (const template of TEMPLATES) {
      for (const key of template.triggerFindingKeys) {
        expect(seen.has(key), `${key} mapped twice`).toBe(false);
        seen.set(key, template.key);
      }
    }
  });

  it("keeps ledger-only keys out of the template table", () => {
    for (const key of LEDGER_ONLY_KEYS) expect(templateForFinding(key)).toBeNull();
    expect(LEDGER_ONLY_KEYS).toContain("trust.cross_signal");
    expect(LEDGER_ONLY_KEYS).toContain("aeo.website_no_faq_schema");
  });

  it("routes the website FAQ trigger to visibility-content and carries trilingual copy", () => {
    expect(templateForFinding(WEBSITE_FAQ_TRIGGER)?.key).toBe("visibility-content");
    for (const template of TEMPLATES) {
      expect(template.title.en).toBeTruthy();
      expect(template.title["zh-HK"]).toBeTruthy();
      expect(template.title["zh-TW"]).toBeTruthy();
    }
    expect(templateByKey("google-reconnect").capability).toBe("Requires connection");
    expect(() => templateByKey("nope" as never)).toThrow();
  });
});

describe("verifyChecks", () => {
  it("is declared by exactly the two website-backed templates", () => {
    const declared = TEMPLATES.filter((t) => t.verifyChecks?.length).map((t) => t.key).sort();
    expect(declared).toEqual(["visibility-content", "website-basics"]);
  });

  it("names only real website check keys", () => {
    // A typo here would make an action permanently unverifiable while
    // compiling and passing every other test. Guard against this test itself
    // going vacuous (e.g. if a future change stopped populating verifyChecks
    // anywhere): assert there is at least one declared key before checking them.
    const allDeclaredKeys = TEMPLATES.flatMap((t) => t.verifyChecks ?? []);
    expect(allDeclaredKeys.length).toBeGreaterThan(0);
    for (const template of TEMPLATES) {
      for (const key of template.verifyChecks ?? []) {
        expect(WEBSITE_CHECK_KEYS).toContain(key);
      }
    }
  });

  it("maps visibility-content to the FAQ schema check", () => {
    expect(TEMPLATES.find((t) => t.key === "visibility-content")?.verifyChecks).toEqual(["faq_schema"]);
  });

  it("maps website-basics to the three basics checks", () => {
    expect(TEMPLATES.find((t) => t.key === "website-basics")?.verifyChecks).toEqual([
      "title",
      "meta_description_50_160",
      "single_h1",
    ]);
  });
});
