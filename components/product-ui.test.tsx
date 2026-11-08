// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house",
  useSearchParams: () => new URLSearchParams(),
}));
// The topbar assistant is unrelated to navigation and pulls in its own client dependencies.
vi.mock("@/components/pocket-assistant/assistant-sheet", () => ({ ContextualAssistant: () => null }));

import type { ShellWorkspace } from "@/components/product-ui";
import { CapabilityBadge } from "@/components/product-ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { copy } from "@/lib/copy";

beforeAll(() => {
  // The sidebar's mobile hook reads matchMedia, which jsdom does not implement.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  });
});
afterEach(cleanup);

it("labels Live as feature availability, without claiming publication", () => {
  render(<CapabilityBadge value="Live" context="action" />);
  expect(screen.getByText("Feature available", { exact: true })).toBeVisible();
  expect(screen.queryByText("Live", { exact: true })).toBeNull();
});

const workspace: ShellWorkspace = {
  slug: "kam-man-house",
  name: "Kam Man House",
  avatarInitial: "K",
  locations: [{ slug: "yik-yam", name: "Yik Yam" }],
  defaultLocationSlug: "yik-yam",
  usage: { approvedDeliveries: 1, allowance: 3 },
  account: { name: "Willy Lai", email: "willy@example.com", roleLabel: "Owner" },
  unreadNotifications: 0,
  demo: false,
};

function mount(overrides: Partial<ShellWorkspace> = {}, locale: "en" | "zh-HK" | "zh-TW" = "en") {
  const value = { ...workspace, ...overrides };
  return render(<WorkspaceShell locale={locale} workspace={value}><h1>Page</h1></WorkspaceShell>);
}

const offersLinks = () => screen.queryAllByRole("link").filter((link) => link.getAttribute("href")?.includes("/offers"));

// Phase 4: Offers is a mode of Actions › New, never a navigation destination, whatever the flag.
describe("WorkspaceShell destinations (Phase 4)", () => {
  it.each([undefined, false, true])("shows the same four destinations with offersEnabled=%s and no Offers link", (offersEnabled) => {
    mount({ offersEnabled });
    expect(offersLinks()).toHaveLength(0);
    for (const key of ["today", "actions", "insights", "business"] as const) {
      expect(screen.getAllByRole("link", { name: copy.en.shell.nav[key] })).toHaveLength(2); // sidebar and mobile bar
    }
  });

  it.each(["zh-HK", "zh-TW"] as const)("localises every destination in %s", (locale) => {
    mount({}, locale);
    for (const key of ["today", "actions", "insights", "business"] as const) {
      expect(screen.getAllByRole("link", { name: copy[locale].shell.nav[key] }).length).toBeGreaterThan(0);
    }
  });
});

describe("PublicHeader sign-in link (F-20)", () => {
  it("links to the plain sign-in page by default", async () => {
    const { PublicHeader } = await import("@/components/product-ui");
    render(<PublicHeader locale="en" />);
    expect(screen.getByRole("link", { name: copy.en.nav.signIn })).toHaveAttribute("href", "/en/owner/sign-in");
  });

  it("uses the page's sign-in href, so a report keeps its claim through sign-in", async () => {
    const { PublicHeader } = await import("@/components/product-ui");
    render(<PublicHeader locale="zh-HK" signInHref="/zh-HK/owner/sign-in?claim=abc123" />);
    expect(screen.getByRole("link", { name: copy["zh-HK"].nav.signIn })).toHaveAttribute("href", "/zh-HK/owner/sign-in?claim=abc123");
  });
});
