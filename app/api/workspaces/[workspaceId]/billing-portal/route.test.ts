import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  load: vi.fn(),
  portal: vi.fn(),
}));
vi.mock("@/lib/owner/billing-authorization", () => ({
  loadWorkspaceBillingContext: state.load,
}));
vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => true,
  getStripeClient: () => ({
    billingPortal: { sessions: { create: state.portal } },
  }),
}));
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const workspace = {
  id,
  slug: "fixture",
  market: "hk",
  tier: "lite",
  stripe_customer_id: "cus_fixture" as string | null,
};
const request = () =>
  POST(
    new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ locale: "en" }),
    }),
    { params: Promise.resolve({ workspaceId: id }) },
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_ORIGIN", "http://localhost");
  vi.stubEnv("COMMERCIAL_CONTRACT_APPROVED", "2026-09-baseline");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_HK_TIER_PRICE_ID", "price_hk");
  vi.stubEnv("STRIPE_TW_TIER_PRICE_ID", "price_tw");
  state.load.mockResolvedValue({
    access: { ok: true },
    workspace: { ...workspace },
  });
  state.portal.mockResolvedValue({
    url: "https://billing.stripe.test/fixture",
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("billing-portal", () => {
  it("creates a portal session for an existing Stripe customer when billing is open", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://billing.stripe.test/fixture" });
    expect(state.portal).toHaveBeenCalledWith({
      customer: "cus_fixture",
      return_url: `http://localhost/en/owner/fixture/settings/billing`,
    });
  });

  it("returns 409 no_subscription when open but the workspace has no Stripe customer yet", async () => {
    state.load.mockResolvedValue({
      access: { ok: true },
      workspace: { ...workspace, stripe_customer_id: null },
    });
    const response = await request();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no_subscription" });
    expect(state.portal).not.toHaveBeenCalled();
  });

  it("returns 503 billing_unavailable and never calls Stripe when the contract is unapproved", async () => {
    vi.stubEnv("COMMERCIAL_CONTRACT_APPROVED", "");
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "billing_unavailable" });
    expect(state.portal).not.toHaveBeenCalled();
  });

  it("still returns the auth error, not 503, when billing is closed and access is denied", async () => {
    vi.stubEnv("COMMERCIAL_CONTRACT_APPROVED", "");
    state.load.mockResolvedValue({
      access: { ok: false, code: "forbidden", status: 403 },
      workspace: null,
    });
    const response = await request();
    expect(response.status).toBe(403);
    expect(state.portal).not.toHaveBeenCalled();
  });
});
