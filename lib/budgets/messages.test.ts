import { describe, expect, it } from "vitest";

import { getMessages } from "@/lib/i18n";
import { aiBudgetRefusal, scanStartRefusal } from "./messages";

const LOCALES = ["en", "zh-HK", "zh-TW"] as const;

describe("budget refusal copy", () => {
  it("uses the spec's English words", () => {
    expect(scanStartRefusal("en", 503, "at_capacity")).toBe("Free scans are at capacity right now. Please try again in a few hours.");
    expect(aiBudgetRefusal("en", 429, "ai_budget_reached")).toBe("Today's AI drafting limit has been reached. Try again later.");
  });

  it.each(LOCALES)("maps each refusal to its own %s string", (locale) => {
    expect(scanStartRefusal(locale, 503, "at_capacity")).toBe(getMessages(locale).budget.scanAtCapacity);
    expect(aiBudgetRefusal(locale, 429, "ai_budget_reached")).toBe(getMessages(locale).budget.aiLimit);
  });

  it("keeps zh-HK and zh-TW in their own registers", () => {
    expect(getMessages("zh-HK").budget.scanAtCapacity).toBe("免費掃描名額暫時已滿，請於數小時後再試。");
    expect(getMessages("zh-TW").budget.scanAtCapacity).toBe("免費掃描目前已達上限，請於幾個小時後再試。");
    expect(getMessages("zh-HK").budget.aiLimit).toBe("今日的 AI 草稿生成額度已用完，請稍後再試。");
    expect(getMessages("zh-TW").budget.aiLimit).toBe("今天的 AI 草稿生成額度已用完，請稍後再試。");
  });

  it("leaves every other failure to its existing message", () => {
    expect(scanStartRefusal("en", 503, "unavailable")).toBeNull();
    expect(scanStartRefusal("en", 429, "at_capacity")).toBeNull();
    expect(aiBudgetRefusal("en", 429, "rate_limited")).toBeNull();
    expect(aiBudgetRefusal("en", 503, "ai_budget_reached")).toBeNull();
  });

  it("maps the paused kill switches (P3.5d) ahead of the capacity/limit refusals", () => {
    expect(scanStartRefusal("en", 503, "paused")).toBe(getMessages("en").pause.scans);
    expect(aiBudgetRefusal("zh-HK", 503, "ai_paused")).toBe(getMessages("zh-HK").pause.ai);
  });

  it.each(LOCALES)("maps the pause refusals to their own %s string", (locale) => {
    expect(scanStartRefusal(locale, 503, "paused")).toBe(getMessages(locale).pause.scans);
    expect(aiBudgetRefusal(locale, 503, "ai_paused")).toBe(getMessages(locale).pause.ai);
  });

  it("still returns null for an unrecognised 503 error", () => {
    expect(scanStartRefusal("en", 503, "other")).toBeNull();
  });
});
