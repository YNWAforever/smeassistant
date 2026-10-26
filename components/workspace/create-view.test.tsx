// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render as renderLive, screen } from "@testing-library/react";

const clientMocks = vi.hoisted(() => ({ createObjectiveAction: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn() }));
vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createObjectiveAction: clientMocks.createObjectiveAction,
}));
vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/create",
  useSearchParams: () => new URLSearchParams(),
}));

import { CreateView, type CreateViewProps } from "@/components/workspace/create-view";
import { copy } from "@/lib/copy";
import { isOfferTemplate, TEMPLATES } from "@/lib/workspace/templates";
import { getMessages } from "@/lib/i18n";

/**
 * The registry is the source of truth for both the split and the badges.
 * Offer-backed templates are reached from Offers, not from an objective (R11).
 */
const AGENT_TEMPLATES = TEMPLATES.filter((template) => template.agentKey !== null && !isOfferTemplate(template));
const LEAD_KEYS = ["review-response", "visibility-content", "website-basics"] as const;

function render(overrides: Partial<CreateViewProps> = {}) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <CreateView
      locale="en"
      workspaceSlug="kam-man-house"
      workspaceId="ws-1"
      role="owner"
      inScope
      location="yik-yam"
      locationId="loc-1"
      locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
      openActions={[]}
      {...overrides}
    />,
  );
  return root;
}

function cardTitles(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll(".goal-card h2")).map((node) => node.textContent?.trim() ?? "");
}

describe("CreateView goal ordering", () => {
  it("leads with review reply, FAQ and website basics, in that order", () => {
    const titles = cardTitles(render());
    const labels = copy.en.workspace.templates;
    expect(titles.slice(0, LEAD_KEYS.length)).toEqual(LEAD_KEYS.map((key) => labels[key].title));
  });

  it("keeps every agent-backed capability except offer-backed ones (reached from Offers) reachable, exactly once", () => {
    const titles = cardTitles(render());
    const labels = copy.en.workspace.templates;
    const expected = AGENT_TEMPLATES.map((template) => labels[template.key].title);
    expect(titles.slice().sort()).toEqual(expected.slice().sort());
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("offers neither offer template: offer actions are created only from an offer", () => {
    const titles = cardTitles(render());
    const labels = copy.en.workspace.templates;
    expect(titles).not.toContain(labels["offer-instagram-post"].title);
    expect(titles).not.toContain(labels["offer-google-post"].title);
    expect(TEMPLATES.filter(isOfferTemplate).map((t) => t.key)).toEqual(["offer-instagram-post", "offer-google-post"]);
  });

  it.each(["en", "zh-HK", "zh-TW"] as const)("shows only three goals until other writing is opened (%s)", locale => {
    const root = render({ locale });
    const more = root.querySelector("details.other-goals")!;
    expect(more).not.toBeNull();
    expect(more.hasAttribute("open")).toBe(false);
    expect(more.querySelector("summary")?.textContent).toBe(locale === "en" ? "Other ways to write" : "其他寫法");
    const face = [...root.querySelectorAll(".goal-card")].filter(card => !card.closest("details"));
    expect(face.map(card => card.querySelector("h2")?.textContent)).toEqual(LEAD_KEYS.map(key => copy[locale].workspace.templates[key].title));
    expect(cardTitles(root).length).toBe(AGENT_TEMPLATES.length);
  });

  it("keeps secondary evidence-led goals in the disclosure and starts on a visible lead goal", () => {
    const root = render({ openActions: [{ id: "social", templateKey: "social-post", evidence: "A social opportunity", freshness: "today", factType: "Observed" }] });
    expect(root.querySelector(".goal-card.is-selected h2")?.textContent).toBe("Reply to unanswered Google reviews");
    expect(root.querySelector("details .goal-card h2")?.textContent).toBeTruthy();
    expect(root.querySelector('[role="tablist"]')).toBeNull();
  });

});

describe("CreateView capability labelling", () => {
  // Guards the condition, not the four Beta instances: a template promoted or
  // demoted in lib/workspace/templates.ts is covered without editing this test.
  it.each(AGENT_TEMPLATES.map((t) => [t.key, t.capability] as const))(
    "labels %s with its real capability (%s)",
    (key, capability) => {
      const root = render();
      const title = copy.en.workspace.templates[key].title;
      const card = Array.from(root.querySelectorAll(".goal-card")).find(
        (node) => node.querySelector("h2")?.textContent?.trim() === title,
      );
      expect(card, `no card rendered for ${key}`).toBeTruthy();
      expect(card?.textContent).toContain(capability);
    },
  );

  it("shows Beta on exactly the templates the registry calls Beta", () => {
    const root = render();
    const labels = copy.en.workspace.templates;
    const betaTitles = Array.from(root.querySelectorAll(".goal-card"))
      .filter((node) => node.textContent?.includes("Beta"))
      .map((node) => node.querySelector("h2")?.textContent?.trim());
    const expected = AGENT_TEMPLATES.filter((t) => t.capability === "Beta").map((t) => labels[t.key].title);
    expect(betaTitles.slice().sort()).toEqual(expected.slice().sort());
    expect(expected.length).toBeGreaterThan(0);
  });
});

describe("CreateView and the AI drafting limit", () => {
  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    clientMocks.createObjectiveAction.mockReset().mockResolvedValue({ ok: true, data: { actionId: "act-new", runError: "ai_budget_reached" } });
    toastMocks.error.mockReset();
  });
  afterEach(cleanup);

  it.each([
    ["en", "What do you want to achieve?", "Start writing"],
    ["zh-HK", "你想達成甚麼？", "開始寫稿"],
    ["zh-TW", "你想達成甚麼？", "開始寫稿"],
  ] as const)("says in %s that the action exists but today's drafting limit was reached", async (locale, field, button) => {
    renderLive(
      <CreateView
        locale={locale}
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        role="owner"
        inScope
        location="yik-yam"
        locationId="loc-1"
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        openActions={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText(field), { target: { value: "Promote this week's lunch set warmly" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(button) }));
    });
    expect(clientMocks.createObjectiveAction).toHaveBeenCalledOnce();
    expect(toastMocks.error).toHaveBeenCalledWith(getMessages(locale).budget.aiLimit);
  });
});

describe("CreateView while AI drafting is paused (P3.5d)", () => {
  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    clientMocks.createObjectiveAction.mockReset().mockResolvedValue({ ok: true, data: { actionId: "act-new", runError: "ai_paused" } });
    toastMocks.error.mockReset();
  });
  afterEach(cleanup);

  it.each([
    ["en", "What do you want to achieve?", "Start writing"],
    ["zh-HK", "你想達成甚麼？", "開始寫稿"],
    ["zh-TW", "你想達成甚麼？", "開始寫稿"],
  ] as const)("says in %s that the action exists but AI drafting is paused", async (locale, field, button) => {
    renderLive(
      <CreateView
        locale={locale}
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        role="owner"
        inScope
        location="yik-yam"
        locationId="loc-1"
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        openActions={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText(field), { target: { value: "Promote this week's lunch set warmly" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(button) }));
    });
    expect(clientMocks.createObjectiveAction).toHaveBeenCalledOnce();
    expect(toastMocks.error).toHaveBeenCalledWith(getMessages(locale).pause.ai);
  });
});


it("keeps the selected goal's fact-type labels inside a closed explanation", () => {
  const root = render({ locale: "zh-HK" });
  const facts = root.querySelector(".fact-stack")!;
  expect(facts.closest("details")?.hasAttribute("open")).toBe(false);
  expect(facts.closest("details")?.querySelector("summary")?.textContent).toBe("點解咁講");
  expect(root.querySelector(".page-intro")?.textContent ?? "").not.toContain("Agent");
});
