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
