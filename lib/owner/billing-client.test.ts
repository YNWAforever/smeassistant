import { afterEach, describe, expect, it, vi } from "vitest";
import { createOwnerBillingLink, createOwnerBillingPortalLink, createOwnerCheckoutLink } from "./billing-client";

describe("createOwnerCheckoutLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the workspace id and locale to the checkout-link route and returns the url", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ url: "https://checkout.stripe.com/pay/cs_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOwnerCheckoutLink("ws-1", "en");

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/ws-1/checkout-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "en" }),
    });
    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/pay/cs_123" });
  });

  it("surfaces the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "already_paid" }), { status: 409 })),
    );
    const result = await createOwnerCheckoutLink("ws-1", "en");
    expect(result).toEqual({ ok: false, error: "already_paid" });
  });

  it("surfaces a network failure without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await createOwnerCheckoutLink("ws-1", "en");
    expect(result).toEqual({ ok: false, error: "network down" });
  });
});

describe("createOwnerBillingPortalLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the workspace id and locale to the billing-portal route and returns the url", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ url: "https://billing.stripe.com/p/session/test_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOwnerBillingPortalLink("ws-1", "zh-TW");

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/ws-1/billing-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "zh-TW" }),
    });
    expect(result).toEqual({ ok: true, url: "https://billing.stripe.com/p/session/test_1" });
  });

  it("surfaces the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "no_subscription" }), { status: 409 })),
    );
    const result = await createOwnerBillingPortalLink("ws-1", "en");
    expect(result).toEqual({ ok: false, error: "no_subscription" });
  });
});

describe("createOwnerBillingLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // This is the paid/unpaid dispatch CheckoutCta's click handler relies on --
  // pinned here because renderToStaticMarkup (this repo's only render tool,
  // no @testing-library/react) never fires onClick, so a rendering-only test
  // of CheckoutCta's labels would never catch this branch being inverted.
  it("hits the checkout-link route when not paid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ url: "https://checkout.stripe.com/pay/cs_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOwnerBillingLink(false, "ws-1", "en");

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/ws-1/checkout-link", expect.anything());
    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/pay/cs_123" });
  });

  it("hits the billing-portal route when paid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ url: "https://billing.stripe.com/p/session/test_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOwnerBillingLink(true, "ws-1", "en");

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/ws-1/billing-portal", expect.anything());
    expect(result).toEqual({ ok: true, url: "https://billing.stripe.com/p/session/test_1" });
  });
});
