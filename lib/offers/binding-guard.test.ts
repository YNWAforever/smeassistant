import { describe, expect, it, vi } from "vitest";
import { offerRow } from "./fixtures.test-helpers";
import { assertOfferBinding, offerBindingForEdit, type EditBindingRepository } from "./binding-guard";
import type { OfferRow } from "./types";

const OFFER = offerRow().id;
const now = new Date("2026-10-10T04:00:00Z");

function repo(opts: { meta?: unknown; firstExportedAt?: string | null; template?: string; offerId?: string | null; offer?: OfferRow | null; base?: unknown } = {}): EditBindingRepository {
  const context = (meta: unknown) => ({
    meta, first_exported_at: opts.firstExportedAt ?? null, action_id: "act-1", template_key: opts.template ?? "offer-gbp-post",
    offer_id: opts.offerId === undefined ? OFFER : opts.offerId, workspace_id: "W1", location_id: null, timezone: "Asia/Hong_Kong", market: "hk",
  });
  return {
    versionBindingContext: vi.fn(async (id: string) => (id === "base" ? context(opts.base) : context(opts.meta ?? { offer: { id: OFFER, revision: 1 } }))),
    actionOfferContext: vi.fn(async () => ({ template_key: opts.template ?? "offer-gbp-post", offer_id: opts.offerId === undefined ? OFFER : opts.offerId, workspace_id: "W1", location_id: null, timezone: "Asia/Hong_Kong", market: "hk" })),
    assistantOffer: vi.fn(async () => (opts.offer === undefined ? offerRow() : opts.offer)),
  };
}

describe("assertOfferBinding", () => {
  it("passes a current binding and any non-offer action", async () => {
    expect(await assertOfferBinding(repo(), "v1", { firstExportOnly: false, now })).toBeNull();
    expect(await assertOfferBinding(repo({ template: "gbp-post", meta: {} }), "v1", { firstExportOnly: false, now })).toBeNull();
  });
  it("refuses each stale state with its code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refuse = async (o: Parameters<typeof repo>[0]) => (await assertOfferBinding(repo(o), "v1", { firstExportOnly: false, now }))?.error;
    expect(await refuse({ offer: offerRow({ revision: 2 }) })).toBe("offer_changed");
    expect(await refuse({ offer: offerRow({ ends_on: "2026-10-09" }) })).toBe("offer_ended");
    expect(await refuse({ offer: offerRow({ status: "draft", confirmed_at: null }) })).toBe("offer_unconfirmed");
    expect(await refuse({ offer: offerRow({ status: "archived", archived_at: "x" }) })).toBe("offer_archived");
    expect(await refuse({ meta: {} })).toBe("offer_unbound");
    expect(await refuse({ meta: { offer: { id: "not-a-uuid", revision: 1 } } })).toBe("offer_unbound");
    expect(await refuse({ offerId: null })).toBe("offer_unbound");
    expect(await refuse({ offer: null })).toBe("offer_unbound");
    expect(warn).toHaveBeenCalledWith("[offers] binding refused", { category: "offer_binding_refused", status: "changed" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Weekday");
    warn.mockRestore();
  });
  it("lets an already-exported version be copied again after the offer changed", async () => {
    const changed = repo({ offer: offerRow({ revision: 2 }), firstExportedAt: "2026-10-05T00:00:00Z" });
    expect(await assertOfferBinding(changed, "v1", { firstExportOnly: true, now })).toBeNull();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await assertOfferBinding(changed, "v1", { firstExportOnly: false, now })).toEqual({ status: 409, error: "offer_changed" });
    expect(await assertOfferBinding(repo({ offer: offerRow({ revision: 2 }) }), "v1", { firstExportOnly: true, now })).toEqual({ status: 409, error: "offer_changed" });
    warn.mockRestore();
  });
});

describe("offerBindingForEdit", () => {
  it("inherits the base version's binding, even when the offer has moved on", async () => {
    const r = repo({ offer: offerRow({ revision: 2 }), base: { offer: { id: OFFER, revision: 1 } } });
    expect(await offerBindingForEdit(r, "act-1", "base", now)).toEqual({ offer: { id: OFFER, revision: 1 } });
  });
  it("binds to the current revision without a base, and to nothing when unusable", async () => {
    expect(await offerBindingForEdit(repo({ offer: offerRow({ revision: 3 }) }), "act-1", null, now)).toEqual({ offer: { id: OFFER, revision: 3 } });
    expect(await offerBindingForEdit(repo({ offer: offerRow({ status: "draft", confirmed_at: null }) }), "act-1", null, now)).toBeNull();
    expect(await offerBindingForEdit(repo({ base: {} }), "act-1", "base", now)).toBeNull();
  });
  it("does nothing for a non-offer action", async () => {
    const r = repo({ template: "review-response" });
    expect(await offerBindingForEdit(r, "act-1", null, now)).toBeNull();
    expect(r.assistantOffer).not.toHaveBeenCalled();
  });
});
