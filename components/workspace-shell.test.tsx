// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/en/owner/example/actions", location: "branch" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams({ location: route.location }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { WorkspaceShell } from "@/components/workspace-shell";
import type { ShellWorkspace } from "@/components/product-ui";

const workspace: ShellWorkspace = {
  slug: "example", name: "Example", avatarInitial: "E", demo: false,
  locations: [{ slug: "branch", name: "Branch" }], defaultLocationSlug: "branch",
  usage: { approvedDeliveries: 1, allowance: 3 },
  account: { name: "Owner", email: "owner@example.test", roleLabel: "Owner" },
  unreadNotifications: 0,
};

function view(pathname: string) {
  route.pathname = pathname;
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<WorkspaceShell locale="en" workspace={workspace}><h1>Page</h1></WorkspaceShell>);
  return root;
}

describe("focused owner navigation", () => {
  it("keeps five destinations in desktop navigation and carries the selected branch to More", () => {
    const sidebar = view("/en/owner/example").querySelector(".workspace-sidebar")!;
    const links = sidebar.querySelectorAll("[data-slot='sidebar-menu'] a");
    expect(links).toHaveLength(5);
    expect(sidebar.querySelector('a[href="/en/owner/example/more?location=branch"]')).not.toBeNull();
    expect(sidebar.querySelector('a[href*="/settings/team"]')).toBeNull();
  });

  it.each(["/en/owner/example/actions", "/en/owner/example/actions/action-1"])("marks Actions current even with a branch query (%s)", pathname => {
    const root = view(pathname);
    const active = root.querySelectorAll('a[href="/en/owner/example/actions?location=branch"][aria-current="page"]');
    expect(active).toHaveLength(2);
  });

  it.each(["/en/owner/example/assets", "/en/owner/example/settings/team"])("marks More current for its supporting destination (%s)", pathname => {
    const root = view(pathname);
    expect(root.querySelectorAll('a[href="/en/owner/example/more?location=branch"][aria-current="page"]')).toHaveLength(2);
  });

  it("names More in the current-section context when its menu is open", () => {
    expect(view("/en/owner/example/more").querySelector(".workspace-topbar-context strong")?.textContent).toBe("More");
  });

  it.each(["en", "zh-HK", "zh-TW"] as const)("the account control opens the authenticated account/workspace page (%s)", locale => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(<WorkspaceShell locale={locale} workspace={workspace}><h1>Page</h1></WorkspaceShell>);
    const account = root.querySelector(".account-button");
    expect(account?.tagName).toBe("A");
    expect(account?.getAttribute("href")).toBe(`/${locale}/owner/select-workspace`);
    expect(account?.getAttribute("title")).toBe("owner@example.test");
    expect(account?.textContent).toContain("Owner");
  });
});
