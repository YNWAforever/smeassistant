import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit half of upstream's test/integration/stripe-webhook.integration.test.ts
 * (the Docker-backed cases cannot run here): signature handling plus the
 * checkout and lifecycle branches against a mocked service-role client.
 */
const constructEvent = vi.fn();
const retrieveSubscription = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => true,
  getStripeClient: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve: retrieveSubscription },
  }),
}));

const db = vi.hoisted(() => ({
  workspaces: new Map<string, { id: string; tier: string; stripe_customer_id: string | null }>(),
  tierEvents: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; tier: string }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table === "workspaces") {
        return {
          select: () => ({
            eq: (column: string, value: string) => ({
              maybeSingle: async () => {
                const rows = [...db.workspaces.values()];
                const row = column === "id" ? db.workspaces.get(value) : rows.find((r) => r.stripe_customer_id === value);
                return { data: row ? { id: row.id, tier: row.tier } : null, error: null };
              },
            }),
          }),
          update: (patch: { tier: string }) => ({
            eq: async (_c: string, id: string) => {
              const row = db.workspaces.get(id);
              if (row) row.tier = patch.tier;
              db.updates.push({ id, tier: patch.tier });
              return { error: null };
            },
          }),
        };
      }
      // workspace_tier_events
      return {
        insert: (row: Record<string, unknown>) => ({
          select: async () => {
            const duplicate = db.tierEvents.some((e) => e.stripe_event_id === row.stripe_event_id);
            if (duplicate) return { error: { code: "23505", message: "duplicate" } };
            db.tierEvents.push(row);
            return { data: [{ id: "evt-row" }], error: null };
          },
        }),
      };
    },
  }),
}));

import { POST } from "./route";

const WS = "11111111-1111-4111-8111-111111111111";

function checkoutCompletedEvent(id: string, workspaceId: string, customerId: string) {
  return { id, type: "checkout.session.completed", data: { object: { customer: customerId, subscription: `sub_${id}`, metadata: { workspace_id: workspaceId } } } };
}
function subscriptionEvent(id: string, type: string, customerId: string, status: string) {
  return { id, type, data: { object: { id: `sub_${id}`, customer: customerId, status } } };
}
function currentSubscription(id: string, customerId: string, status: string, workspaceId?: string) {
  return { id, customer: customerId, status, metadata: workspaceId ? { workspace_id: workspaceId } : {} };
}
function webhookRequest(signature = "sig") {
  return new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": signature } });
}

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_123");
  db.workspaces.clear();
  db.tierEvents = [];
  db.updates = [];
  constructEvent.mockReset();
  retrieveSubscription.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/stripe", () => {
  it("rejects a request with no signature header", async () => {
    const res = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("rejects a request whose signature fails verification", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("signature mismatch");
    });
    const res = await POST(webhookRequest("bad"));
    expect(res.status).toBe(400);
    expect(constructEvent).toHaveBeenCalledWith("{}", "bad", "whsec_test_123");
    expect(db.updates).toEqual([]);
  });

  it("refuses to run without STRIPE_WEBHOOK_SECRET", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await POST(webhookRequest())).status).toBe(500);
  });

  it("sets tier to paid on checkout.session.completed only after confirming current subscription status", async () => {
    db.workspaces.set(WS, { id: WS, tier: "lite", stripe_customer_id: "cus_abc" });
    constructEvent.mockReturnValue(checkoutCompletedEvent("evt_1", WS, "cus_abc"));
    retrieveSubscription.mockResolvedValue(currentSubscription("sub_evt_1", "cus_abc", "active", WS));

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_evt_1");
    expect(db.workspaces.get(WS)?.tier).toBe("paid");
    expect(db.tierEvents).toEqual([{ workspace_id: WS, tier: "paid", source: "stripe_webhook", stripe_event_id: "evt_1" }]);
  });

  it("does not grant paid access when Checkout completes with an incomplete subscription", async () => {
    db.workspaces.set(WS, { id: WS, tier: "lite", stripe_customer_id: "cus_inc" });
    constructEvent.mockReturnValue(checkoutCompletedEvent("evt_inc", WS, "cus_inc"));
    retrieveSubscription.mockResolvedValue(currentSubscription("sub_evt_inc", "cus_inc", "incomplete", WS));

    expect((await POST(webhookRequest())).status).toBe(200);
    expect(db.workspaces.get(WS)?.tier).toBe("lite");
    expect(db.tierEvents).toHaveLength(0);
  });

  it("downgrades an unpaid subscription found by Stripe customer id", async () => {
    db.workspaces.set(WS, { id: WS, tier: "paid", stripe_customer_id: "cus_unpaid" });
    constructEvent.mockReturnValue(subscriptionEvent("evt_unpaid", "customer.subscription.updated", "cus_unpaid", "active"));
    retrieveSubscription.mockResolvedValue(currentSubscription("sub_evt_unpaid", "cus_unpaid", "unpaid"));

    expect((await POST(webhookRequest())).status).toBe(200);
    expect(db.workspaces.get(WS)?.tier).toBe("lite");
    expect(db.tierEvents.map((e) => e.tier)).toEqual(["lite"]);
  });

  it("keeps access during past_due without writing a redundant tier event", async () => {
    db.workspaces.set(WS, { id: WS, tier: "paid", stripe_customer_id: "cus_due" });
    constructEvent.mockReturnValue(subscriptionEvent("evt_due", "customer.subscription.updated", "cus_due", "past_due"));
    retrieveSubscription.mockResolvedValue(currentSubscription("sub_evt_due", "cus_due", "past_due"));

    expect((await POST(webhookRequest())).status).toBe(200);
    expect(db.workspaces.get(WS)?.tier).toBe("paid");
    expect(db.tierEvents).toHaveLength(0);
  });

  it("returns 500 for an unknown current subscription status instead of guessing entitlement", async () => {
    db.workspaces.set(WS, { id: WS, tier: "paid", stripe_customer_id: "cus_x" });
    constructEvent.mockReturnValue(subscriptionEvent("evt_x", "customer.subscription.updated", "cus_x", "active"));
    retrieveSubscription.mockResolvedValue(currentSubscription("sub_evt_x", "cus_x", "future_status"));

    expect((await POST(webhookRequest())).status).toBe(500);
    expect(db.workspaces.get(WS)?.tier).toBe("paid");
  });

  it("is idempotent -- a duplicate event id re-applies the tier but records one event", async () => {
    db.workspaces.set(WS, { id: WS, tier: "lite", stripe_customer_id: "cus_ghi" });
    constructEvent.mockReturnValue(checkoutCompletedEvent("evt_3", WS, "cus_ghi"));
    retrieveSubscription.mockResolvedValue(currentSubscription("sub_evt_3", "cus_ghi", "active", WS));

    expect((await POST(webhookRequest())).status).toBe(200);
    db.workspaces.get(WS)!.tier = "lite"; // simulate a first delivery that failed between the two writes
    expect((await POST(webhookRequest())).status).toBe(200);
    expect(db.tierEvents).toHaveLength(1);
    expect(db.workspaces.get(WS)?.tier).toBe("paid");
  });

  it("returns 500 (so Stripe retries) when the checkout references an unknown workspace", async () => {
    constructEvent.mockReturnValue(checkoutCompletedEvent("evt_5", WS, "cus_none"));
    retrieveSubscription.mockResolvedValue(currentSubscription("sub_evt_5", "cus_none", "active", WS));
    expect((await POST(webhookRequest())).status).toBe(500);
  });
});
