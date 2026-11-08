// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/en/owner/example" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { WorkspaceShell } from "@/components/workspace-shell";
import type { ShellWorkspace } from "@/components/product-ui";

const base: ShellWorkspace = {
  slug: "example",
  name: "Example",
  avatarInitial: "E",
  demo: false,
  locations: [{ slug: "branch", name: "Branch" }],
  defaultLocationSlug: "branch",
  usage: { approvedDeliveries: 1, allowance: 3 },
  account: { name: "Owner", email: "owner@example.test", roleLabel: "Owner" },
  unreadNotifications: 0,
};

function view(workspace: ShellWorkspace, pathname = "/en/owner/example") {
  route.pathname = pathname;
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<WorkspaceShell locale="en" workspace={workspace}><h1>Page</h1></WorkspaceShell>);
  return root;
}

/**
 * Conversation Studio navigation integration (design §2 S1/S6, §8 "Nav").
 * With the flag on, Studio is the first owner surface and the top-bar sheet
 * trigger becomes a direct "Open Studio" link; with the flag off the shell is
 * identical to before (five destinations, assistant trigger present).
 */
describe("Studio navigation", () => {
  const enabled = { ...base, studioEnabled: true };

  it("puts Studio first in the desktop sidebar and marks it current on /studio", () => {
    const root = view(enabled, "/en/owner/example/studio");
    const sidebar = root.querySelector(".workspace-sidebar")!;
    const links = Array.from(sidebar.querySelectorAll("[data-slot='sidebar-menu'] a"));
    expect(links).toHaveLength(6);
    expect(links[0]!.getAttribute("href")).toBe("/en/owner/example/studio?location=branch");
    expect(links[0]!.textContent).toContain("Studio");
    // The root redirects to the Studio, so the Home tab points at /today.
    expect(links[1]!.getAttribute("href")).toBe("/en/owner/example/today?location=branch");
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.getAttribute("href"))).toEqual([
      "/en/owner/example/studio?location=branch",
    ]);
  });

  it("marks the Home tab current on /today and links the brand to the Studio", () => {
    const root = view(enabled, "/en/owner/example/today");
    const sidebar = root.querySelector(".workspace-sidebar")!;
    const home = sidebar.querySelector('a[href="/en/owner/example/today?location=branch"]')!;
    expect(home.getAttribute("aria-current")).toBe("page");
    expect(sidebar.querySelector(".brand-lockup")?.getAttribute("href")).toBe("/en/owner/example/studio");
  });

  it("keeps Studio/Home/Actions/Insights/More in the mobile bottom bar (no Create)", () => {
    const root = view(enabled);
    const mobile = Array.from(root.querySelectorAll(".mobile-bottom-nav a")).map((link) => link.textContent ?? "");
    expect(mobile).toHaveLength(5);
    expect(mobile[0]).toBe("Studio");
    expect(mobile.some((label) => label === "Create")).toBe(false);
    expect(mobile).toContain("More");
  });

  it("replaces the top-bar assistant trigger with an Open Studio link", () => {
    const root = view(enabled, "/en/owner/example/actions");
    const entry = root.querySelector(".workspace-topbar .workspace-studio-link");
    expect(entry?.tagName).toBe("A");
    expect(entry?.getAttribute("href")).toBe("/en/owner/example/studio?location=branch");
    expect(root.querySelector(".workspace-topbar .assistant-launcher")).toBeNull();
  });

  it("is absent when the flag is off, keeping the old five-link navigation and the assistant", () => {
    const root = view(base);
    const sidebar = root.querySelector(".workspace-sidebar")!;
    expect(sidebar.querySelectorAll("[data-slot='sidebar-menu'] a")).toHaveLength(5);
    expect(sidebar.querySelector('a[href*="/studio"]')).toBeNull();
    // Flag off: the workspace root is still the Today brief.
    expect(sidebar.querySelector('a[href="/en/owner/example?location=branch"]')).not.toBeNull();
    expect(sidebar.querySelector('a[href*="/today"]')).toBeNull();
    expect(root.querySelector(".workspace-studio-link")).toBeNull();
    expect(root.querySelector(".workspace-topbar .assistant-launcher")).not.toBeNull();
  });
});
