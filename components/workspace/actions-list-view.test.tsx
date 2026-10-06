// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
afterEach(cleanup);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/en/owner/shop/actions", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/pocket-assistant/assistant-sheet", () => ({ ContextualAssistant: () => null }));
import { ActionsListView } from "./actions-list-view";

it.each(["en", "zh-HK", "zh-TW"] as const)("%s shows a bounded page and scoped next link without carrying the cursor into tabs", locale => {
  render(<ActionsListView locale={locale} workspaceSlug="shop" workspaceId="w" timezone="Asia/Hong_Kong" role="viewer" locations={[]} locationId={null}
    filters={{ location: "all", channel: "google", status: "recommended", pageSize: 50, cursor: "old", view: "drafts" }}
    result={{ actions: [], counts: { all: 100, drafts: 50, needs_input: 0, awaiting_approval: 50, completed: 0 }, nextCursor: "opaque_next", hasMore: true }} />);
  const next = screen.getByRole("link", { name: locale === "en" ? "Next page" : "下一頁" });
  const url = new URL(next.getAttribute("href")!, "https://fixture.example.test");
  expect(url.pathname).toBe(`/${locale}/owner/shop/actions`);
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ location: "all", channel: "google", status: "recommended", view: "drafts", pageSize: "50", cursor: "opaque_next" });
  for (const link of screen.getAllByRole("link").filter(link => link.getAttribute("aria-current") !== null)) expect(link.getAttribute("href")).not.toContain("cursor");
  expect(screen.getByText(locale === "en" ? "Refresh first page" : "重新載入首頁")).toBeVisible();
});
