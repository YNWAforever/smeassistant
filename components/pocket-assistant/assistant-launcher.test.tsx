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

describe("lazy Ask Kinnso launcher", () => {
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
    const trigger = screen.getByRole("button", { name: "Ask Kinnso" });
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
    fireEvent.click(screen.getByRole("button", { name: "Ask Kinnso" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Ask Kinnso panel header", () => {
  // The English title read "Pocket Growth Assistant" under a "Visibility
  // Operator" badge: two names for one assistant. The badge now says where the
  // answers come from.
  it.each([
    ["demo", "en", "Ask Kinnso", "Demo data"],
    ["live", "en", "Ask Kinnso", "This workspace's evidence"],
    ["demo", "zh-HK", "問 Kinnso", "示範資料"],
  ] as const)("names the assistant once and badges its %s data (%s)", (mode, locale, title, badge) => {
    render(<Panel locale={locale} surface="sample" mode={mode} initialOpen context={mode === "live" ? { workspaceId: "ws-1" } : undefined} />);
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(dialog.textContent).toContain(badge);
    expect(dialog.textContent).not.toContain("Pocket Growth Assistant");
  });
});
