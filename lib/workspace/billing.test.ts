import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceContext } from "@/lib/workspace/queries";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tierEvents: [] as Row[],
  workspace: { stripe_customer_id: null as string | null },
  usage: null as Row | null,
  inserts: [] as Row[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => makeDb() }));

function makeDb() {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const terminal = () => {
        if (table === "workspace_tier_events") return { data: state.tierEvents, error: null };
        if (table === "workspaces") return { data: state.workspace, error: null };
        if (table === "workspace_usage") return { data: state.usage, error: null };
        return { data: null, error: null };
      };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self, order: self, limit: self,
        eq: (c: string, v: unknown) => { filters[c] = v; return chain; },
        insert: (row: Row) => { state.inserts.push(row); state.usage = { period: row.period, approved_deliveries: 0, allowance: row.allowance }; return Promise.resolve({ error: null }); },
        returns: () => Promise.resolve(terminal()),
        maybeSingle: () => Promise.resolve(terminal()),
      });
      return chain;
    },
  };
}

import { getBilling, listTierEvents, readUsage } from "./billing";

const ctx: WorkspaceContext = {
  workspace: { id: "ws-1", slug: "kam-man-house", name: "Kam Man House", market: "hk", tier: "lite", timezone: "Asia/Hong_Kong", isDemo: false, instagramHandle: null, industry: null, district: null },
  locations: [],
  usage: { period: "2026-09", approvedDeliveries: 1, allowance: 3 },
  unreadNotifications: 0,
  membership: { workspaceId: "ws-1", workspaceSlug: "kam-man-house", userId: "u1", email: "o@example.test", role: "owner", locationScope: null },
  account: { name: "o", email: "o@example.test" },
};

beforeEach(() => {
  state.tierEvents = [
    { id: "e2", tier: "paid", source: "stripe_webhook", stripe_event_id: "evt_2", created_at: "2026-09-02T00:00:00Z" },
    { id: "e1", tier: "lite", source: "staff_grant", stripe_event_id: null, created_at: "2026-09-01T00:00:00Z" },
  ];
  state.workspace = { stripe_customer_id: null };
  state.usage = null;
  state.inserts = [];
});

describe("getBilling", () => {
  it("binds tier, usage, tier events, Stripe customer presence and the market price", async () => {
    const model = await getBilling(ctx);
    expect(model.tier).toBe("lite");
    expect(model.usage).toEqual({ period: "2026-09", approvedDeliveries: 1, allowance: 3 });
    expect(model.tierEvents).toEqual([
      { id: "e2", tier: "paid", source: "stripe_webhook", stripeEventId: "evt_2", createdAt: "2026-09-02T00:00:00Z" },
      { id: "e1", tier: "lite", source: "staff_grant", stripeEventId: null, createdAt: "2026-09-01T00:00:00Z" },
    ]);
    expect(model.stripeCustomer).toBe(false);
    expect(model.marketPrice).toEqual({ amount: 888, currency: "HKD", unit: "per_location_per_month" });
  });

  it("reports a Stripe customer and the TW price for a tw workspace", async () => {
    state.workspace = { stripe_customer_id: "cus_1" };
    const model = await getBilling({ ...ctx, workspace: { ...ctx.workspace, market: "tw", tier: "paid" } });
    expect(model.stripeCustomer).toBe(true);
    expect(model.tier).toBe("paid");
    expect(model.marketPrice.currency).toBe("TWD");
  });
});

describe("listTierEvents", () => {
  it("maps rows to camelCase", async () => {
    const rows = await listTierEvents(makeDb() as never, "ws-1");
    expect(rows.map((r) => r.id)).toEqual(["e2", "e1"]);
  });
});

describe("readUsage", () => {
  it("returns the existing row without inserting", async () => {
    state.usage = { period: "2026-09", approved_deliveries: 2, allowance: null };
    const usage = await readUsage(makeDb() as never, { workspaceId: "ws-1", tier: "paid", timezone: "Asia/Hong_Kong", now: new Date("2026-09-15T00:00:00Z") });
    expect(usage).toEqual({ period: "2026-09", approvedDeliveries: 2, allowance: null });
    expect(state.inserts).toEqual([]);
  });

  it("creates the period row lazily with the tier allowance (lite → 3)", async () => {
    const usage = await readUsage(makeDb() as never, { workspaceId: "ws-1", tier: "lite", timezone: "Asia/Hong_Kong", now: new Date("2026-09-15T00:00:00Z") });
    expect(state.inserts).toEqual([{ workspace_id: "ws-1", period: "2026-09", allowance: 3 }]);
    expect(usage).toEqual({ period: "2026-09", approvedDeliveries: 0, allowance: 3 });
  });
});
