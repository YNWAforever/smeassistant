// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import { ContextualAssistant as Launcher } from "@/components/pocket-assistant/assistant-launcher";
import { ContextualAssistant as Panel } from "@/components/pocket-assistant/assistant-sheet";

beforeEach(() => {
  if (!window.matchMedia)
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("lazy Visibility Operator launcher", () => {
  it.each(["en", "zh-HK", "zh-TW"] as const)("renders the same trigger as the panel in %s", (locale) => {
    const launcher = renderToStaticMarkup(<Launcher locale={locale} surface="sample" />);
    const panel = renderToStaticMarkup(<Panel locale={locale} surface="sample" />);
    const text = (html: string) => { const root = document.createElement("div"); root.innerHTML = html; return root.querySelector("button")?.textContent; };
    expect(text(launcher)).toBe(text(panel));
    expect(launcher).toContain('class="');
    expect(launcher).toContain("assistant-launcher");
  });

  it("loads the panel on click and opens it", async () => {
    render(<Launcher locale="en" surface="sample" />);
    const trigger = screen.getByRole("button", { name: "Ask Visibility Operator" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("keeps an accessible name when a bar hides the label text", () => {
    render(<Launcher locale="zh-HK" surface="home" triggerLabel="問增長助理" />);
    expect(screen.getByRole("button", { name: "問增長助理" })).toHaveAttribute("aria-label", "問增長助理");
  });

  it("does nothing while disabled", async () => {
    render(<Launcher locale="en" surface="sample" disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Visibility Operator" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
