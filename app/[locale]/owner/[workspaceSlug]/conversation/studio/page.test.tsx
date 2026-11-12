import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }) }));
vi.mock("next/navigation", () => ({ permanentRedirect: mocks.redirect }));

import Page from "./page";

it("permanently redirects the old Studio URL and preserves its query", async () => {
  const props = {
    params: Promise.resolve({ locale: "en", workspaceSlug: "shop" }),
    searchParams: Promise.resolve({ location: "branch", chat: "c1", action: "a1", ask: "explain_priority" }),
  };
  await expect(Page(props)).rejects.toThrow("redirect:/en/owner/shop/conversation?location=branch&chat=c1&action=a1&ask=explain_priority");
  expect(mocks.redirect).toHaveBeenCalledWith("/en/owner/shop/conversation?location=branch&chat=c1&action=a1&ask=explain_priority");
});

it("omits an empty query instead of adding a dangling question mark", async () => {
  const props = {
    params: Promise.resolve({ locale: "zh-HK", workspaceSlug: "shop" }),
    searchParams: Promise.resolve({}),
  };
  await expect(Page(props)).rejects.toThrow("redirect:/zh-HK/owner/shop/conversation");
});
