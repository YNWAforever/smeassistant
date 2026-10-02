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

import { WorkspaceShell, type ShellWorkspace } from "@/components/product-ui";
import { copy } from "@/lib/copy";

beforeAll(() => {
  // The sidebar's mobile hook reads matchMedia, which jsdom does not implement.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  });
});
afterEach(cleanup);

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
  return render(<WorkspaceShell locale={locale} workspace={{ ...workspace, ...overrides }}><div /></WorkspaceShell>);
}

const offersLinks = () => screen.queryAllByRole("link").filter((link) => link.getAttribute("href")?.includes("/offers"));

describe("WorkspaceShell offers entry (P4.1)", () => {
  it("has no Offers link when offersEnabled is absent", () => {
    mount();
    expect(offersLinks()).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Offers" })).toBeNull();
  });

  it("has no Offers link when offersEnabled is false", () => {
    mount({ offersEnabled: false });
    expect(offersLinks()).toHaveLength(0);
  });

  it("shows one Offers link, scoped to the location, only when enabled", () => {
    mount({ offersEnabled: true });
    const links = offersLinks();
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/en/owner/kam-man-house/offers?location=yik-yam");
    expect(links[0]).toHaveTextContent("Offers");
  });

  it.each(["zh-HK", "zh-TW"] as const)("localises the label in %s", (locale) => {
    mount({ offersEnabled: true }, locale);
    expect(offersLinks()[0]).toHaveTextContent(copy[locale].workspace.offers.nav);
  });
});
