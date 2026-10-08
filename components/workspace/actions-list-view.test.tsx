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
  expect(screen.getByText(locale === "en" ? "Refresh first page" : "重新載入首頁")).toBeVisible();
});
