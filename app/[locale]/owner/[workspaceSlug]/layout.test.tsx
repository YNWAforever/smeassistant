// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/en/owner/example/actions", location: "branch" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams({ location: route.location }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const loaders = vi.hoisted(() => ({
  requireMembership: vi.fn(),
  loadWorkspaceContext: vi.fn(),
  countUrgentActions: vi.fn(),
  buildShellWorkspace: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireMembership: loaders.requireMembership }));
vi.mock("@/lib/workspace/queries", () => ({
  loadWorkspaceContext: loaders.loadWorkspaceContext,
  countUrgentActions: loaders.countUrgentActions,
}));
vi.mock("@/lib/workspace/shell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace/shell")>();
  return { ...actual, buildShellWorkspace: loaders.buildShellWorkspace };
});

import Layout from "./layout";
import type { ShellWorkspace } from "@/components/product-ui";

const shellWorkspace: ShellWorkspace = {
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

const props = {
  children: <h1>Page</h1>,
  params: Promise.resolve({ locale: "en", workspaceSlug: "example" }),
};

const FOUR = ["Today", "Tasks", "Results", "Business"];
const FIVE = ["Today", "Tasks", "Kinnso", "Results", "Business"];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("CONVERSATION_HOME_ENABLED", undefined);
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", undefined);
  loaders.requireMembership.mockResolvedValue({ workspaceSlug: "example" });
  loaders.loadWorkspaceContext.mockResolvedValue({ workspace: { id: "ws", isDemo: false } });
  loaders.countUrgentActions.mockResolvedValue(0);
  loaders.buildShellWorkspace.mockReturnValue({ ...shellWorkspace });
});

afterEach(() => vi.unstubAllEnvs());

async function renderNav(home: string | undefined, studio: string | undefined) {
  if (home === undefined) vi.stubEnv("CONVERSATION_HOME_ENABLED", undefined);
  else vi.stubEnv("CONVERSATION_HOME_ENABLED", home);
  if (studio === undefined) vi.stubEnv("CONVERSATION_STUDIO_ENABLED", undefined);
  else vi.stubEnv("CONVERSATION_STUDIO_ENABLED", studio);
  route.pathname = "/en/owner/example/actions";
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Layout(props));
  return {
    labels: [...root.querySelectorAll("[data-slot='sidebar-menu'] a")].map((link) => link.textContent),
    hrefs: [...root.querySelectorAll("[data-slot='sidebar-menu'] a")].map((link) => link.getAttribute("href")),
    mobile: root.querySelectorAll(".mobile-bottom-nav a").length,
  };
}

describe("workspace layout conversation nav flags", () => {
  it("enables the Kinnso destination only when both conversation flags are on", async () => {
    const bothOn = await renderNav("true", "true");
    expect(bothOn.labels).toEqual(FIVE);
    expect(bothOn.hrefs).toContain("/en/owner/example/conversation?location=branch");
    expect(bothOn.mobile).toBe(5);
  });

  it("keeps four destinations and no Kinnso link when Home is on and Studio is off", async () => {
    const nav = await renderNav("true", "false");
    expect(nav.labels).toEqual(FOUR);
    expect(nav.hrefs).not.toContain("/en/owner/example/conversation?location=branch");
    expect(nav.hrefs?.some((href) => href?.includes("/conversation"))).toBe(false);
    expect(nav.mobile).toBe(4);
  });

  it("omits Kinnso when Studio is on and Home is off", async () => {
    const nav = await renderNav("false", "true");
    expect(nav.labels).toEqual(FOUR);
    expect(nav.hrefs?.some((href) => href?.includes("/conversation"))).toBe(false);
  });

  it("omits Kinnso when both flags are unset", async () => {
    const nav = await renderNav(undefined, undefined);
    expect(nav.labels).toEqual(FOUR);
  });
});
