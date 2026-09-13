// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/create",
  useSearchParams: () => new URLSearchParams(),
}));

import { CreateView, type CreateViewProps } from "@/components/workspace/create-view";
import { copy } from "@/lib/copy";
import { TEMPLATES } from "@/lib/workspace/templates";

/** The registry is the source of truth for both the split and the badges. */
const AGENT_TEMPLATES = TEMPLATES.filter((template) => template.agentKey !== null);
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

  it("keeps every agent-backed capability reachable, exactly once", () => {
    const titles = cardTitles(render());
    const labels = copy.en.workspace.templates;
    const expected = AGENT_TEMPLATES.map((template) => labels[template.key].title);
    expect(titles.slice().sort()).toEqual(expected.slice().sort());
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("renders a second group so the remaining capabilities are demoted, not hidden", () => {
    const root = render();
    const headings = Array.from(root.querySelectorAll(".eyebrow")).map((n) => n.textContent?.trim());
    expect(headings).toContain("Recommended starting points");
    expect(headings).toContain("Other capabilities");
    // Demoted means below the lead group, not removed.
    expect(cardTitles(root).length).toBe(AGENT_TEMPLATES.length);
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
