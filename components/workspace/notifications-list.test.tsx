// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/settings/notifications",
  useSearchParams: () => new URLSearchParams(),
}));

import { NotificationList } from "@/components/workspace/notifications-client";
import type { NotificationRow } from "@/lib/workspace/queries-pages";

const lt = (s: string) => ({ en: s, "zh-HK": s, "zh-TW": s });

function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "scan.completed",
    title: lt("Scan finished"),
    body: lt("Coverage 78%"),
    href: "/en/owner/kam-man-house",
    read_at: null,
    created_at: "2026-09-01T10:00:00Z",
    ...over,
  };
}

function render(rows: NotificationRow[]) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <NotificationList locale="en" workspaceId="ws-1" timezone="Asia/Hong_Kong" rows={rows} />,
  );
  return root;
}

describe("NotificationList", () => {
  // P2.5 item 24: read_at was never written, so the bell's unread dot could
  // never go out and the page offered no way to clear it.
  it("offers mark-all while something is unread", () => {
    const button = render([row()]).querySelector("button");
    expect(button?.textContent).toContain("Mark all as read");
    expect(button?.hasAttribute("disabled")).toBe(false);
  });

  it("disables mark-all once everything is read", () => {
    const button = render([row({ read_at: "2026-09-02T10:00:00Z" })]).querySelector("button");
    expect(button?.hasAttribute("disabled")).toBe(true);
  });

  it("marks unread rows so the state is visible, not only counted", () => {
    const root = render([row({ id: "a1" }), row({ id: "a2", read_at: "2026-09-02T10:00:00Z" })]);
    expect(root.querySelectorAll(".is-unread")).toHaveLength(1);
  });

  it("keeps a row without a link readable rather than dropping it", () => {
    const root = render([row({ href: null })]);
    expect(root.textContent).toContain("Scan finished");
    expect(root.querySelector("a")).toBeNull();
  });

  it("says so when there is nothing, instead of an empty card", () => {
    expect(render([]).textContent).toContain("No notifications yet.");
  });
});
