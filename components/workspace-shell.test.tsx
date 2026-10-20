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

describe("five-destination owner navigation (Phase 4)", () => {
  it("keeps five destinations in desktop navigation, each carrying the selected branch", () => {
    const sidebar = view("/en/owner/example").querySelector(".workspace-sidebar")!;
    const links = Array.from(sidebar.querySelectorAll("[data-slot='sidebar-menu'] a")).map((link) => link.getAttribute("href"));
    expect(links).toEqual([
      "/en/owner/example?location=branch",
      "/en/owner/example/actions?location=branch",
      "/en/owner/example/insights?location=branch",
      "/en/owner/example/business?location=branch",
      "/en/owner/example/settings?location=branch",
    ]);
  });

  it.each([
    ["/en/owner/example", "/en/owner/example?location=branch"],
    ["/en/owner/example/actions", "/en/owner/example/actions?location=branch"],
    ["/en/owner/example/actions/action-1", "/en/owner/example/actions?location=branch"],
    ["/en/owner/example/actions/new", "/en/owner/example/actions?location=branch"],
    ["/en/owner/example/packs/p1", "/en/owner/example/actions?location=branch"],
    ["/en/owner/example/insights", "/en/owner/example/insights?location=branch"],
    ["/en/owner/example/business/assets", "/en/owner/example/business?location=branch"],
    ["/en/owner/example/business/profile", "/en/owner/example/business?location=branch"],
    ["/en/owner/example/settings/team", "/en/owner/example/settings?location=branch"],
    ["/en/owner/example/settings", "/en/owner/example/settings?location=branch"],
  ])("marks one destination current on %s, in the sidebar and the mobile bar", (pathname, href) => {
    const root = view(pathname);
    const current = root.querySelectorAll('a[aria-current="page"]');
    expect(current).toHaveLength(2);
    for (const link of current) expect(link.getAttribute("href")).toBe(href);
  });

  it.each([
    ["/en/owner/example/actions/new", "New action"],
    ["/en/owner/example/actions/action-1", "Review & approve"],
    ["/en/owner/example/business/integrations", "Business"],
    ["/en/owner/example/settings/plan", "Settings"],
  ])("names the current section on %s", (pathname, label) => {
    expect(view(pathname).querySelector(".workspace-topbar-context strong")?.textContent).toBe(label);
  });

  it("links the brand to the plain workspace URL, with no location parameter", () => {
    // Signed-in flows (and the acceptance sign-in fixture) wait for this exact href.
    expect(view("/en/owner/example/actions").querySelector(".brand-lockup")?.getAttribute("href")).toBe("/en/owner/example");
  });

  it("shows the Kinnso OS brand, never the old product names", () => {
    const text = view("/en/owner/example").textContent ?? "";
    expect(text).toContain("Kinnso OS");
    expect(text).not.toMatch(/Visibility Workspace|SME Scanner/);
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
