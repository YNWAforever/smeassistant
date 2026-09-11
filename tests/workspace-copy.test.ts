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
