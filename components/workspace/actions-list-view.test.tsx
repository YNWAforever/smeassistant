// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
afterEach(cleanup);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/en/owner/shop/actions", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/pocket-assistant/assistant-sheet", () => ({ ContextualAssistant: () => null }));
import { ActionsListView } from "./actions-list-view";
import { buildActionOverview, type ActionRow } from "@/lib/workspace/overview";

const row: ActionRow = {
  id: "action", workspace_id: "w", location_id: null, template_key: "review-response", source: "finding", source_finding_keys: [],
  title: { en: "Reply", "zh-HK": "回覆", "zh-TW": "回覆" }, summary: {}, evidence: {}, priority: "high", priority_score: 50,
  priority_factors: [], effort_minutes: 10, required_inputs: [], provided_inputs: {}, assignee_user_id: null, due_at: null,
  action_state: "recommended", measurement_state: "not_eligible", capability: "Live", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
};

it.each(["en", "zh-HK", "zh-TW"] as const)("%s distinguishes a named, unavailable and empty assignment on visible cards", locale => {
  for (const assignee of [{ id: "u", name: "accepted@example.test" }, { id: "u", name: "" }, undefined]) {
    const action = buildActionOverview(row, { location: null, latestRun: null, latestVersion: null, assignee });
    const view = render(<ActionsListView locale={locale} workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="viewer" locations={[]} locationId={null}
      filters={{}} result={{ actions: [action], counts: { all: 1, drafts: 0, needs_input: 0, awaiting_approval: 0, completed: 0 }, nextCursor: null, hasMore: false }} />);
    const label = screen.getByText(locale === "en" ? "Assignee" : "負責人", { selector: "dt" });
    expect(label.nextElementSibling).toHaveTextContent(assignee?.name || (assignee ? (locale === "en" ? "Assigned member unavailable" : "已指派成員不可用") : (locale === "en" ? "Unassigned" : "未指派")));
    view.unmount();
  }
});

it.each(["en", "zh-HK", "zh-TW"] as const)("%s shows a bounded page and scoped next link without carrying the cursor into tabs", locale => {
  render(<ActionsListView locale={locale} workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="viewer" locations={[]} locationId={null}
    filters={{ location: "all", channel: "google", status: "recommended", pageSize: 50, cursor: "old", view: "drafts", q: "reply", assignee: "unassigned", due: "today" }}
    result={{ actions: [], counts: { all: 100, drafts: 50, needs_input: 0, awaiting_approval: 50, completed: 0 }, nextCursor: "opaque_next", hasMore: true }} />);
  const next = screen.getByRole("link", { name: locale === "en" ? "Next page" : "下一頁" });
  const url = new URL(next.getAttribute("href")!, "https://fixture.example.test");
  expect(url.pathname).toBe(`/${locale}/owner/shop/actions`);
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ location: "all", channel: "google", status: "recommended", view: "drafts", pageSize: "50", cursor: "opaque_next", q: "reply", assignee: "unassigned", due: "today" });
  expect(screen.queryByRole("checkbox")).toBeNull();
  for (const link of screen.getAllByRole("link").filter(link => link.getAttribute("aria-current") !== null)) expect(link.getAttribute("href")).not.toContain("cursor");
  // On a later page (cursor set) the list offers a way back to the first page.
  expect(screen.getByText({ en: "Back to the first page", "zh-HK": "返去第一頁", "zh-TW": "回到第一頁" }[locale])).toBeVisible();
});

it("offers no first-page link on the first page", () => {
  render(<ActionsListView locale="en" workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="viewer" locations={[]} locationId={null}
    filters={{ location: "all" }} result={{ actions: [], counts: { all: 0, drafts: 0, needs_input: 0, awaiting_approval: 0, completed: 0 }, nextCursor: null, hasMore: false }} />);
  expect(screen.queryByText("Back to the first page")).toBeNull();
});

it("gives each card a Preview link that keeps the list filters, and places the panel beside the list", () => {
  const action = buildActionOverview(row, { location: null, latestRun: null, latestVersion: null });
  render(<ActionsListView locale="en" workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="owner" locations={[]} locationId={null}
    filters={{ location: "all", view: "drafts" }} panel={<aside data-testid="panel" />}
    result={{ actions: [action], counts: { all: 1, drafts: 1, needs_input: 0, awaiting_approval: 0, completed: 0 }, nextCursor: null, hasMore: false }} />);
  expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute("href", "/en/owner/shop/actions?location=all&view=drafts&open=action");
  const panel = screen.getByTestId("panel");
  expect(panel.parentElement).toHaveClass("actions-split");
});

it("keeps the current page in the Preview link, so Close returns to it", () => {
  const action = buildActionOverview(row, { location: null, latestRun: null, latestVersion: null });
  render(<ActionsListView locale="en" workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="owner" locations={[]} locationId={null}
    filters={{ location: "all", view: "drafts", cursor: "page_2" }}
    result={{ actions: [action], counts: { all: 1, drafts: 1, needs_input: 0, awaiting_approval: 0, completed: 0 }, nextCursor: null, hasMore: false }} />);
  expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute("href", "/en/owner/shop/actions?location=all&view=drafts&cursor=page_2&open=action");
});

it("has no Preview link for a reconnect action, whose card goes to Integrations", () => {
  const action = buildActionOverview({ ...row, template_key: "google-reconnect" }, { location: null, latestRun: null, latestVersion: null });
  render(<ActionsListView locale="en" workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="owner" locations={[]} locationId={null}
    filters={{}} result={{ actions: [action], counts: { all: 1, drafts: 0, needs_input: 0, awaiting_approval: 0, completed: 0 }, nextCursor: null, hasMore: false }} />);
  expect(screen.queryByRole("link", { name: "Preview" })).toBeNull();
});

it("an empty filtered queue offers to clear the filters, keeping the location", () => {
  render(<ActionsListView locale="en" workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="owner" locations={[]} locationId={null}
    filters={{ location: "tin-hau", channel: "google" }} result={{ actions: [], counts: { all: 0, drafts: 0, needs_input: 0, awaiting_approval: 0, completed: 0 }, nextCursor: null, hasMore: false }} />);
  expect(screen.getByRole("heading", { name: "No actions match these filters" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/en/owner/shop/actions?location=tin-hau");
});

it("an empty unfiltered queue says there is nothing to do, with New only for those who may start work", () => {
  const result = { actions: [], counts: { all: 0, drafts: 0, needs_input: 0, awaiting_approval: 0, completed: 0 }, nextCursor: null, hasMore: false };
  const owner = render(<ActionsListView locale="en" workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="owner" locations={[]} locationId={null} filters={{ location: "all" }} result={result} />);
  expect(screen.getByRole("heading", { name: "Nothing to do right now" })).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "New action" }).some((link) => link.getAttribute("href") === "/en/owner/shop/actions/new?location=all")).toBe(true);
  owner.unmount();
  render(<ActionsListView locale="en" workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="viewer" locations={[]} locationId={null} filters={{ location: "all" }} result={result} />);
  expect(screen.queryByRole("link", { name: "New action" })).toBeNull();
});


it("shows waiting work in server order with search only, without capability or point maths", () => {
  const first = buildActionOverview({ ...row, id: "first", title: { en: "First from server" }, priority_score: 10, priority_factors: [{ key: "impact", label: { en: "Impact" }, points: 15 }] }, { location: null, latestRun: null, latestVersion: null });
  const second = buildActionOverview({ ...row, id: "second", title: { en: "Second from server" }, priority_score: 90 }, { location: null, latestRun: null, latestVersion: null });
  const { container } = render(<ActionsListView locale="en" workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="owner" locations={[]} locationId={null}
    filters={{}} result={{ actions: [first, second], counts: { all: 2, drafts: 0, needs_input: 0, awaiting_approval: 0, completed: 0 }, nextCursor: null, hasMore: false }} />);
  expect(screen.getByRole("heading", { level: 1, name: "To do" })).toBeVisible();
  expect([...container.querySelectorAll(".action-card h2")].map(h => h.textContent)).toEqual(["First from server", "Second from server"]);
  expect(container.querySelectorAll(".filter-bar [role=combobox]")).toHaveLength(0);
  expect(screen.getByRole("searchbox")).toBeVisible();
  expect(container.querySelector(".priority-reason")).toBeNull();
  expect(container.querySelector(".action-card")?.textContent).not.toMatch(/Feature available|Live|Beta|Impact \+15/);
});


it("keeps evidence in a closed disclosure and the card summary in view", () => {
  const action = buildActionOverview(row, { location: null, latestRun: null, latestVersion: null });
  const { container } = render(<ActionsListView locale="zh-HK" workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="owner" locations={[]} locationId={null}
    filters={{}} result={{ actions: [action], counts: { all: 1, drafts: 0, needs_input: 0, awaiting_approval: 0, completed: 0 }, nextCursor: null, hasMore: false }} />);
  const evidence = container.querySelector(".action-evidence")!;
  expect(evidence.closest("details")?.hasAttribute("open")).toBe(false);
  expect(evidence.closest("details")?.querySelector("summary")?.textContent).toBe("睇證據");
  // Priority, state and time needed are on the card, not folded away.
  const card = container.querySelector(".action-card")!;
  expect(card.querySelector(".action-card-badges")?.closest("details")).toBeNull();
  expect(card.querySelector(".action-card-effort")?.textContent).toMatch(/\d/);
  expect(container.querySelector(".queue-footnote")?.closest("details")?.hasAttribute("open")).toBe(false);
});


it.each([{ channel: "google" }, { status: "recommended" }, { assignee: "unassigned" }, { due: "today" }, { view: "drafts" }] as const)("lets a nonempty bookmarked list clear its active narrowing (%s)", narrowing => {
  const action = buildActionOverview(row, { location: null, latestRun: null, latestVersion: null });
  render(<ActionsListView locale="en" workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="owner" locations={[]} locationId={null}
    filters={{ location: "primary", ...narrowing }} result={{ actions: [action], counts: { all: 1, drafts: 0, needs_input: 0, awaiting_approval: 0, completed: 0 }, nextCursor: null, hasMore: false }} />);
  expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/en/owner/shop/actions?location=primary");
});
