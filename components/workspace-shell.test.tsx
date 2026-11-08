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

describe("four-destination owner navigation (Phase 2)", () => {
  it("keeps four destinations in desktop navigation, each carrying the selected branch", () => {
    const sidebar = view("/en/owner/example").querySelector(".workspace-sidebar")!;
    const links = Array.from(sidebar.querySelectorAll("[data-slot='sidebar-menu'] a")).map((link) => link.getAttribute("href"));
    expect(links).toEqual([
      "/en/owner/example?location=branch",
      "/en/owner/example/actions?location=branch",
      "/en/owner/example/insights?location=branch",
      "/en/owner/example/business?location=branch",
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
    ["/en/owner/example/settings/team", "/en/owner/example/business?location=branch"],
    ["/en/owner/example/settings", "/en/owner/example/business?location=branch"],
  ])("marks one destination current on %s, in the sidebar and the mobile bar", (pathname, href) => {
    const root = view(pathname);
    const current = root.querySelectorAll('a[aria-current="page"]');
    expect(current).toHaveLength(2);
    for (const link of current) expect(link.getAttribute("href")).toBe(href);
  });

  it.each([
    ["/en/owner/example/actions/new", "New task"],
    ["/en/owner/example/actions/action-1", "Task"],
    ["/en/owner/example/business/integrations", "Shop"],
    ["/en/owner/example/settings/plan", "Shop"],
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


it.each([
  ["en", ["Today", "To do", "Better?", "Shop"]],
  ["zh-HK", ["今日", "待辦", "好啲？", "舖"]],
  ["zh-TW", ["今天", "待辦", "有好一點？", "店裡"]],
] as const)("offers four matching shop destinations on mobile and desktop (%s)", (locale, labels) => {
  route.pathname = `/${locale}/owner/example/settings/notifications`;
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<WorkspaceShell locale={locale} workspace={workspace}><h1>Page</h1></WorkspaceShell>);
  expect([...root.querySelectorAll(".mobile-bottom-nav a")].map(a => a.textContent)).toEqual(labels);
  expect([...root.querySelectorAll("[data-slot='sidebar-menu'] a")].map(a => a.textContent)).toEqual(labels);
  expect(root.querySelector('.mobile-bottom-nav [aria-current="page"]')?.getAttribute("href")).toBe(`/${locale}/owner/example/business?location=branch`);
});

it.each([0, 1, 2])("shows a mobile top-bar location control only for multiple branches (%s)", count => {
  const root = document.createElement("div");
  const locations = [{ slug: "branch", name: "Branch" }, { slug: "second", name: "Second branch" }].slice(0, count);
  root.innerHTML = renderToStaticMarkup(<WorkspaceShell locale="en" workspace={{ ...workspace, locations }}><h1>Page</h1></WorkspaceShell>);
  expect(root.querySelectorAll(".workspace-topbar .workspace-mobile-brand [role=combobox]")).toHaveLength(count > 1 ? 1 : 0);
});

it("omits the optional conversation switch while disabled and adds reachable scoped links when enabled", () => {
  route.pathname = "/en/owner/example";
  const disabled = renderToStaticMarkup(<WorkspaceShell locale="en" workspace={workspace}><p>Today</p></WorkspaceShell>);
  expect(disabled).not.toContain("conversation-switch");
  const enabled = document.createElement("div");
  enabled.innerHTML = renderToStaticMarkup(<WorkspaceShell locale="en" workspace={{ ...workspace, conversationEnabled: true }}><p>Today</p></WorkspaceShell>);
  expect([...enabled.querySelectorAll(".conversation-switch a")].map(a => a.getAttribute("href"))).toEqual(["/en/owner/example?location=branch", "/en/owner/example/conversation?location=branch"]);
  expect(enabled.querySelectorAll(".mobile-bottom-nav a")).toHaveLength(4);
});
