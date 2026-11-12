// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/en/owner/example/actions", location: "branch" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams({ location: route.location }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { WorkspaceShell, destinationFor } from "@/components/workspace-shell";
import type { ShellWorkspace } from "@/components/product-ui";

const workspace: ShellWorkspace = {
  slug: "example", name: "Example", avatarInitial: "E", demo: false,
  conversationEnabled: true,
  locations: [{ slug: "branch", name: "Branch" }], defaultLocationSlug: "branch",
  usage: { approvedDeliveries: 1, allowance: 3 },
  account: { name: "Owner", email: "owner@example.test", roleLabel: "Owner" },
  unreadNotifications: 0,
};

function markup(pathname: string, fixture: ShellWorkspace = workspace) {
  route.pathname = pathname;
  return renderToStaticMarkup(<WorkspaceShell locale="en" workspace={fixture}><h1>Page</h1></WorkspaceShell>);
}

function view(pathname: string, fixture: ShellWorkspace = workspace) {
  const root = document.createElement("div");
  root.innerHTML = markup(pathname, fixture);
  return root;
}

describe("five-destination owner navigation", () => {
  it("offers Today, Tasks, Kinnso, Results and Business in desktop navigation", () => {
    const sidebar = view("/en/owner/example").querySelector(".workspace-sidebar")!;
    const links = Array.from(sidebar.querySelectorAll("[data-slot='sidebar-menu'] a")).map((link) => link.getAttribute("href"));
    expect(links).toEqual([
      "/en/owner/example?location=branch",
      "/en/owner/example/actions?location=branch",
      "/en/owner/example/conversation?location=branch",
      "/en/owner/example/insights?location=branch",
      "/en/owner/example/business?location=branch",
    ]);
  });

  it("omits Kinnso for a workspace that has the conversation surface disabled", () => {
    const root = view("/en/owner/example/actions", { ...workspace, conversationEnabled: false });
    expect([...root.querySelectorAll("[data-slot='sidebar-menu'] a")].map((link) => link.textContent)).toEqual(["Today", "Tasks", "Results", "Business"]);
    expect(root.querySelectorAll(".mobile-bottom-nav a")).toHaveLength(4);
  });

  it.each([
    ["/en/owner/example", "/en/owner/example?location=branch"],
    ["/en/owner/example/actions", "/en/owner/example/actions?location=branch"],
    ["/en/owner/example/actions/action-1", "/en/owner/example/actions?location=branch"],
    ["/en/owner/example/actions/new", "/en/owner/example/actions?location=branch"],
    ["/en/owner/example/packs/p1", "/en/owner/example/actions?location=branch"],
    ["/en/owner/example/conversation/notes", "/en/owner/example/conversation?location=branch"],
    ["/en/owner/example/insights", "/en/owner/example/insights?location=branch"],
    ["/en/owner/example/business/assets", "/en/owner/example/business?location=branch"],
    ["/en/owner/example/business/profile", "/en/owner/example/business?location=branch"],
  ])("marks one destination current on %s", (pathname, href) => {
    const current = view(pathname).querySelectorAll('a[aria-current="page"]');
    expect(current).toHaveLength(2);
    for (const link of current) expect(link.getAttribute("href")).toBe(href);
  });

  it("does not highlight a primary destination for Settings", () => {
    expect(view("/en/owner/example/settings/team").querySelectorAll('a[aria-current="page"]')).toHaveLength(0);
    expect(destinationFor("/en/owner/example/settings", "/en/owner/example")).toBeNull();
  });

  it("names the current section in the topbar", () => {
    expect(view("/en/owner/example/actions/new").querySelector(".workspace-topbar-context strong")?.textContent).toBe("New task");
    expect(view("/en/owner/example/actions/action-1").querySelector(".workspace-topbar-context strong")?.textContent).toBe("Task");
    expect(view("/en/owner/example/business/integrations").querySelector(".workspace-topbar-context strong")?.textContent).toBe("Business");
    expect(view("/en/owner/example/settings/plan").querySelector(".workspace-topbar-context strong")?.textContent).toBe("Settings");
    expect(view("/en/owner/example/conversation/notes").querySelector(".workspace-topbar-context strong")?.textContent).toBe("Kinnso");
  });

  it("links the brand to the plain workspace URL, with no location parameter", () => {
    expect(view("/en/owner/example/actions").querySelector(".brand-lockup")?.getAttribute("href")).toBe("/en/owner/example");
  });

  it("shows the Kinnso OS brand, never the old product names", () => {
    const text = view("/en/owner/example").textContent ?? "";
    expect(text).toContain("Kinnso OS");
    expect(text).not.toMatch(/Visibility Workspace|SME Scanner/);
  });

  it.each([
    ["en", ["Today", "Tasks", "Kinnso", "Results", "Business"]],
    ["zh-HK", ["今日", "待辦", "Kinnso", "成效", "店舖"]],
    ["zh-TW", ["今天", "待辦", "Kinnso", "成效", "店裡"]],
  ] as const)("offers five matching destinations on mobile and desktop (%s)", (locale, labels) => {
    route.pathname = `/${locale}/owner/example/settings/notifications`;
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(<WorkspaceShell locale={locale} workspace={workspace}><h1>Page</h1></WorkspaceShell>);
    expect([...root.querySelectorAll(".mobile-bottom-nav a")].map(a => a.textContent)).toEqual(labels);
    expect([...root.querySelectorAll("[data-slot='sidebar-menu'] a")].map(a => a.textContent)).toEqual(labels);
  });
});

describe("account and settings", () => {
  it.each(["en", "zh-HK", "zh-TW"] as const)("puts Settings and workspace switching in the account menu (%s)", locale => {
    route.pathname = `/${locale}/owner/example`;
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(<WorkspaceShell locale={locale} workspace={workspace}><h1>Page</h1></WorkspaceShell>);
    const account = root.querySelector(".account-button");
    expect(account?.tagName).toBe("SUMMARY");
    expect(account?.getAttribute("title")).toBe("owner@example.test");
    expect(account?.textContent).toContain("Owner");
    const links = [...root.querySelectorAll(".account-menu-popover a")].map(link => link.getAttribute("href"));
    expect(links).toContain(`/${locale}/owner/example/settings`);
    expect(links).toContain(`/${locale}/owner/select-workspace`);
  });

  it("shows a mobile top-bar location control only for multiple branches", () => {
    for (const count of [0, 1, 2]) {
      const locations = [{ slug: "branch", name: "Branch" }, { slug: "second", name: "Second branch" }].slice(0, count);
      route.pathname = "/en/owner/example";
      const root = document.createElement("div");
      root.innerHTML = renderToStaticMarkup(<WorkspaceShell locale="en" workspace={{ ...workspace, locations }}><h1>Page</h1></WorkspaceShell>);
      expect(root.querySelectorAll(".workspace-topbar .workspace-mobile-brand [role=combobox]")).toHaveLength(count > 1 ? 1 : 0);
    }
  });
});

describe("immersive Kinnso chat frame", () => {
  it("drops the global sidebar, mobile nav and owner assistant launcher on the chat route", () => {
    const root = view("/en/owner/example/conversation");
    expect(root.querySelector(".workspace-sidebar")).toBeNull();
    expect(root.querySelector(".mobile-bottom-nav")).toBeNull();
    expect(root.querySelector(".assistant-launcher")).toBeNull();
    expect(root.querySelector(".workspace-content--chat")).not.toBeNull();
    expect(root.querySelector(".workspace-topbar--chat")).not.toBeNull();
  });

  it("keeps the normal shell and primary navigation outside the chat route", () => {
    const root = view("/en/owner/example/conversation/notes");
    expect(root.querySelector(".workspace-sidebar")).not.toBeNull();
    expect(root.querySelector(".mobile-bottom-nav")).not.toBeNull();
    expect(root.querySelector(".workspace-content--chat")).toBeNull();
  });

  it("has no legacy conversation switch or topbar conversation link", () => {
    const root = view("/en/owner/example");
    expect(root.querySelector(".conversation-switch")).toBeNull();
    expect(root.querySelector(".conversation-topbar-link")).toBeNull();
  });
});
