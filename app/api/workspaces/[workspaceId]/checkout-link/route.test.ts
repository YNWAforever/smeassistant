import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  customer: vi.fn(),
  checkout: vi.fn(),
}));
vi.mock("@/lib/owner/billing-authorization", () => ({
  loadWorkspaceBillingContext: state.load,
}));
vi.mock("@/lib/repositories/billing", () => ({
  billingRepository: () => ({ saveCustomer: state.save }),
}));
vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => true,
  getWorkspacePriceId: () => "price_fixture",
  getStripeClient: () => ({
    customers: { create: state.customer },
    checkout: { sessions: { create: state.checkout } },
  }),
}));
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const workspace = {
  id,
  slug: "fixture",
  market: "hk",
  tier: "lite",
  stripe_customer_id: null as string | null,
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
  state.load.mockResolvedValue({
    access: { ok: true },
    workspace: { ...workspace },
  });
  state.customer.mockResolvedValue({ id: "cus_fixture" });
  state.checkout.mockResolvedValue({
    url: "https://checkout.stripe.test/fixture",
  });
  state.save.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("checkout repository boundary", () => {
  it("persists a new Stripe customer before creating the checkout with matching app workspace metadata", async () => {
    expect((await request()).status).toBe(200);
    expect(state.customer).toHaveBeenCalledWith(
      { metadata: { workspace_id: id } },
      { idempotencyKey: `workspace-customer-${id}` },
    );
    expect(state.save).toHaveBeenCalledWith(id, "cus_fixture");
    expect(state.save.mock.invocationCallOrder[0]).toBeLessThan(
      state.checkout.mock.invocationCallOrder[0],
    );
    expect(state.checkout.mock.calls[0][0]).toMatchObject({
      customer: "cus_fixture",
      metadata: { workspace_id: id },
      subscription_data: { metadata: { workspace_id: id } },
    });
  });
  it("stops checkout on customer persistence failure so retry cannot buy against an unrecorded mapping", async () => {
    state.save.mockRejectedValue(new Error("database unavailable"));
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to save Stripe customer",
    });
    expect(state.checkout).not.toHaveBeenCalled();
  });
  it("reuses the mapped customer without creating or replacing it", async () => {
    state.load.mockResolvedValue({
      access: { ok: true },
      workspace: { ...workspace, stripe_customer_id: "cus_existing" },
    });
    expect((await request()).status).toBe(200);
    expect(state.customer).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
    expect(state.checkout.mock.calls[0][0].customer).toBe("cus_existing");
  });
  it("does not call persistence or Stripe when ownership is denied", async () => {
    state.load.mockResolvedValue({
      access: { ok: false, code: "forbidden", status: 403 },
      workspace: null,
    });
    expect((await request()).status).toBe(403);
    expect(state.customer).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });
});
