import { describe, expect, it } from "vitest";
import { copy } from "@/lib/copy";
import { DISPLAY_PHASE_KEYS } from "@/lib/copy-workspace";
import { METRIC_KEYS } from "@/lib/workspace/metrics";
import { TEMPLATES } from "@/lib/workspace/templates";

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("workspace copy", () => {
  it("has identical key sets in all three locales", () => {
    const en = keys(copy.en.workspace).sort();
    expect(keys(copy["zh-HK"].workspace).sort()).toEqual(en);
    expect(keys(copy["zh-TW"].workspace).sort()).toEqual(en);
  });

  it("labels every template, metric and display phase", () => {
    for (const template of TEMPLATES) expect(copy.en.workspace.templates[template.key].title).toBeTruthy();
    for (const key of METRIC_KEYS) expect(copy["zh-HK"].workspace.metrics[key]).toBeTruthy();
    for (const key of DISPLAY_PHASE_KEYS) expect(copy["zh-TW"].workspace.phases[key]).toBeTruthy();
  });
});

describe("checklist copy", () => {
  // Guards the condition: a template that becomes delivery "checklist" without
  // steps would render an empty card where the only completion path lives.
  const checklistTemplates = TEMPLATES.filter((template) => template.delivery === "checklist");

  it("covers every checklist template in every locale", () => {
    expect(checklistTemplates.length).toBeGreaterThan(0);
    for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
      for (const template of checklistTemplates) {
        const entry = copy[locale].workspace.checklistSteps[template.key];
        expect(entry, `${locale} ${template.key}`).toBeTruthy();
        expect(entry!.where.trim().length).toBeGreaterThan(0);
        expect(entry!.steps.length).toBeGreaterThan(0);
        for (const step of entry!.steps) expect(step.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("carries no steps for a template an agent drafts", () => {
    for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
      for (const key of Object.keys(copy[locale].workspace.checklistSteps)) {
        const template = TEMPLATES.find((t) => t.key === key);
        expect(template?.delivery, `${locale} ${key}`).toBe("checklist");
      }
    }
  });
});

describe("offers copy (P4.1)", () => {
  const LOCALES = ["en", "zh-HK", "zh-TW"] as const;

  function strings(value: unknown, prefix = ""): Array<[string, string]> {
    if (typeof value === "string") return [[prefix, value]];
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => strings(v, prefix ? `${prefix}.${k}` : k));
  }
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it("has no empty string in any locale", () => {
    for (const locale of LOCALES) for (const [key, value] of strings(copy[locale].workspace.offers)) expect(value.trim().length, `${locale} ${key}`).toBeGreaterThan(0);
  });

  it("uses the same placeholders in every locale", () => {
    const en = new Map(strings(copy.en.workspace.offers));
    for (const locale of ["zh-HK", "zh-TW"] as const) {
      for (const [key, value] of strings(copy[locale].workspace.offers)) expect(placeholders(value), `${locale} ${key}`).toEqual(placeholders(en.get(key)!));
    }
  });

  it("carries the exact English the owner is promised", () => {
    const t = copy.en.workspace.offers;
    expect(t.confirm.statement).toBe("These details are correct and may be used in drafts.");
    expect(t.promotion.disclosure).toBe("Creates {n} drafts ({channels}). Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery.");
    expect(t.promotion.usage).toBe(" This month: {used} of {allowance} used.");
    expect(t.stale.offer_changed).toBe("The offer changed after this draft was written. Generate a new draft from the current offer.");
    expect(t.stale.offer_expired).toBe("This offer has ended. Extend its dates and confirm it again to use it.");
    expect(t.stale.offer_inactive).toBe("This offer is not confirmed or has been archived.");
  });

  it("never lets an error code stand in for a sentence", () => {
    for (const locale of LOCALES) for (const [key, value] of strings(copy[locale].workspace.offers)) expect(value, `${locale} ${key}`).not.toMatch(/offer_[a-z_]+/);
  });

  it("keeps zh-TW in Taiwan wording and zh-HK in Hong Kong wording", () => {
    const tw = strings(copy["zh-TW"].workspace.offers).map(([, v]) => v).join("");
    const hk = strings(copy["zh-HK"].workspace.offers).map(([, v]) => v).join("");
    for (const hkOnly of ["價錢", "地點", "你", "生成", "帖文"]) expect(tw, `zh-TW contains ${hkOnly}`).not.toContain(hkOnly);
    for (const twOnly of ["據點", "您", "價格", "幣別"]) expect(hk, `zh-HK contains ${twOnly}`).not.toContain(twOnly);
  });
});
