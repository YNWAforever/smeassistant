import { describe, expect, it } from "vitest";
import { copy } from "@/lib/copy";
import { TEMPLATES } from "@/lib/workspace/templates";

// Hong Kong words and Cantonese particles that read wrong to a Taiwan owner.
const HK_ONLY = /帖文|餐牌|相片|嘅|唔|咗|冇|咩|同埋|社交帖|本地搜尋/;

describe("zh-TW task wording", () => {
  it.each(TEMPLATES)("$key stores Taiwan wording", (t) => {
    for (const text of [t.title, t.summary, t.workflow, t.outcome]) expect(text["zh-TW"]).not.toMatch(HK_ONLY);
  });

  it("the zh-TW dictionary uses the same titles the actions store", () => {
    for (const t of TEMPLATES) {
      const entry = (copy["zh-TW"].workspace.templates as Record<string, { title: string; summary: string } | undefined>)[t.key];
      if (!entry) continue;
      expect(entry.title).toBe(t.title["zh-TW"]);
      expect(entry.summary).toBe(t.summary["zh-TW"]);
    }
  });
});
