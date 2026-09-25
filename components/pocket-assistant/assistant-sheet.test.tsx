// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet";
import { getMessages } from "@/lib/i18n";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const TRIGGER = { en: "Ask Visibility Operator", "zh-HK": "問隨身增長助理", "zh-TW": "問隨身增長助理" } as const;
const QUESTION = { en: "Draft one suitable review reply", "zh-HK": "示範 1 則合適的評論回覆", "zh-TW": "示範 1 則合適的評論回覆" } as const;

beforeEach(() => {
  if (!window.matchMedia)
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function ask(locale: keyof typeof TRIGGER) {
  render(<ContextualAssistant locale={locale} surface="actions" mode="live" context={{ workspaceId: WORKSPACE_ID }} />);
  fireEvent.click(screen.getByRole("button", { name: TRIGGER[locale] }));
  const question = await screen.findByRole("button", { name: QUESTION[locale] });
  await act(async () => {
    fireEvent.click(question);
  });
}

describe("ContextualAssistant and the AI drafting limit", () => {
  it.each(["en", "zh-HK", "zh-TW"] as const)("shows the %s limit message instead of a generic failure", async (locale) => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: "ai_budget_reached" }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchSpy);
    await ask(locale);
    expect(await screen.findByText(getMessages(locale).budget.aiLimit)).toBeInTheDocument();
    expect(screen.queryByText(locale === "en" ? "The run could not complete" : "暫時未能完成")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("still reports any other failure as a failed run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: "rate_limited" }) }) as unknown as Response));
    await ask("en");
    expect(await screen.findByText("The run could not complete")).toBeInTheDocument();
    expect(screen.queryByText(getMessages("en").budget.aiLimit)).toBeNull();
  });
});
