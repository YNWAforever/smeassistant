import { describe, expect, it } from "vitest";
import { offerRow } from "./fixtures.test-helpers";
import { bindingStatus, offerUsability } from "./usability";

const ctx = { workspaceId: "W1", actionLocationId: null, market: "hk" as const, today: "2026-10-10" };

describe("offerUsability", () => {
  it("is usable for a confirmed, running offer at the action's location", () => {
    expect(offerUsability(offerRow(), ctx)).toBe("usable");
    expect(offerUsability(offerRow({ location_id: "L1" }), { ...ctx, actionLocationId: "L1" })).toBe("usable");
  });
  it("names why it cannot be used", () => {
    expect(offerUsability(null, ctx)).toBe("missing");
    expect(offerUsability(offerRow({ workspace_id: "W2" }), ctx)).toBe("missing");
    expect(offerUsability(offerRow({ status: "draft", confirmed_at: null }), ctx)).toBe("unconfirmed");
    expect(offerUsability(offerRow({ status: "archived", archived_at: "x" }), ctx)).toBe("archived");
    expect(offerUsability(offerRow({ ends_on: "2026-10-09" }), ctx)).toBe("ended");
    expect(offerUsability(offerRow({ location_id: "L1" }), { ...ctx, actionLocationId: "L2" })).toBe("wrong_location");
    expect(offerUsability(offerRow({ location_id: null }), { ...ctx, actionLocationId: "L1" })).toBe("wrong_location");
    expect(offerUsability(offerRow({ location_id: "L1" }), ctx)).toBe("wrong_location");
    expect(offerUsability(offerRow({ currency: "HKD" }), { ...ctx, market: "tw" })).toBe("wrong_currency");
  });
  it("accepts an unpriced offer on either market", () => {
    const unpriced = offerRow({ price_amount: null, currency: null });
    expect(offerUsability(unpriced, ctx)).toBe("usable");
    expect(offerUsability(unpriced, { ...ctx, market: "tw" })).toBe("usable");
  });
  it("accepts an open-ended offer whatever the date", () => {
    expect(offerUsability(offerRow({ ends_on: null, open_ended: true }), { ...ctx, today: "2099-01-01" })).toBe("usable");
  });
});

describe("bindingStatus", () => {
  const offer = offerRow({ revision: 2 });
  it("is current only for the same confirmed, running revision", () => {
    expect(bindingStatus({ id: offer.id, revision: 2 }, offer, "2026-10-10")).toBe("current");
  });
  it("reports every other state", () => {
    expect(bindingStatus(null, offer, "2026-10-10")).toBe("unbound");
    expect(bindingStatus({ id: offer.id, revision: 2 }, null, "2026-10-10")).toBe("unbound");
    expect(bindingStatus({ id: "other", revision: 2 }, offer, "2026-10-10")).toBe("unbound");
    expect(bindingStatus({ id: offer.id, revision: 1 }, offer, "2026-10-10")).toBe("changed");
    expect(bindingStatus({ id: offer.id, revision: 2 }, offer, "2026-11-01")).toBe("ended");
    expect(bindingStatus({ id: offer.id, revision: 2 }, offerRow({ revision: 2, status: "archived", archived_at: "x" }), "2026-10-10")).toBe("archived");
    expect(bindingStatus({ id: offer.id, revision: 2 }, offerRow({ revision: 2, status: "draft", confirmed_at: null }), "2026-10-10")).toBe("unconfirmed");
  });
});
