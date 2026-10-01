import { describe, expect, it, vi } from "vitest";
import type { Membership } from "@/lib/auth";
import type { OfferRepository } from "@/lib/repositories/offers";
import type { AuditEventInput } from "@/lib/workspace/audit";
import { offerRow } from "./fixtures.test-helpers";
import { archiveOffer, canManageOfferAt, confirmOffer, createOffer, updateOffer, type OfferServiceDeps } from "./service";
import type { OfferRow } from "./types";

const L1 = "00000000-0000-4000-8000-0000000000c1";
const L2 = "00000000-0000-4000-8000-0000000000c2";
const ASSET = "00000000-0000-4000-8000-0000000000d1";

const owner: NonNullable<Membership> = { workspaceId: "W1", workspaceSlug: "w1", userId: "U1", email: "o@example.test", role: "owner", locationScope: null };
const scopedManager: NonNullable<Membership> = { ...owner, userId: "U2", role: "manager", locationScope: [L1] };
const viewer: NonNullable<Membership> = { ...owner, userId: "U3", role: "viewer" };

const body = { title: "Lunch set", details: "Soup and main", price_amount: 88, starts_on: "2026-10-05", ends_on: "2026-10-31" };

function fakeRepo(initial: OfferRow | null = null): OfferRepository & { rows: Map<string, OfferRow> } {
  const rows = new Map<string, OfferRow>(initial ? [[initial.id, initial]] : []);
  return {
    rows,
    list: async () => [...rows.values()],
    get: async (_w, id) => rows.get(id) ?? null,
    create: async (input) => {
      const row = offerRow({ ...input, id: "00000000-0000-4000-8000-0000000000a9", workspace_id: input.workspaceId, status: "draft", confirmed_at: null, confirmed_by: null, revision: 1 });
      rows.set(row.id, row);
      return row;
    },
    update: async (_w, id, expected, patch) => {
      const row = rows.get(id);
      if (!row) return null;
      if (row.status === "archived") return "archived";
      if (row.revision !== expected) return "conflict";
      const next = { ...row, ...patch, revision: row.revision + 1, status: "draft" as const, confirmed_at: null, confirmed_by: null };
      rows.set(id, next);
      return next;
    },
    confirm: async (_w, id, expected, actor) => {
      const row = rows.get(id);
      if (!row) return null;
      if (row.revision !== expected || row.status !== "draft") return "conflict";
      const next = { ...row, status: "confirmed" as const, confirmed_at: "2026-10-01T00:00:00Z", confirmed_by: actor };
      rows.set(id, next);
      return next;
    },
    archive: async (_w, id) => {
      const row = rows.get(id);
      if (!row) return null;
      const next = { ...row, status: "archived" as const, archived_at: "2026-10-02T00:00:00Z" };
      rows.set(id, next);
      return next;
    },
    draftCounts: async () => new Map(),
  };
}

function deps(overrides: Partial<OfferServiceDeps> = {}, assets: Record<string, { id: string; location_id: string | null; rights_status: string }> = {}) {
  const events: AuditEventInput[] = [];
  const d: OfferServiceDeps = {
    repo: fakeRepo(),
    assets: { get: async (_w, id) => assets[id] ?? null },
    audit: vi.fn(async (input: AuditEventInput) => { events.push(input); }),
    membership: owner,
    workspace: { id: "W1", market: "hk", timezone: "Asia/Hong_Kong" },
    now: new Date("2026-10-01T04:00:00Z"),
    locale: "zh-HK",
    ipHash: "hash",
    ...overrides,
  };
  return { d, events };
}

describe("canManageOfferAt", () => {
  it("lets owners and unscoped managers manage any location", () => {
    expect(canManageOfferAt(owner, null)).toBe(true);
    expect(canManageOfferAt({ ...owner, role: "manager" }, null)).toBe(true);
  });
  it("keeps a scoped manager inside their locations and off workspace-wide offers", () => {
    expect(canManageOfferAt(scopedManager, L1)).toBe(true);
    expect(canManageOfferAt(scopedManager, L2)).toBe(false);
    expect(canManageOfferAt(scopedManager, null)).toBe(false);
  });
  it("never lets a viewer manage", () => {
    expect(canManageOfferAt(viewer, null)).toBe(false);
  });
});

describe("createOffer", () => {
  it("creates a draft and audits ids only", async () => {
    const { d, events } = deps();
    const result = await createOffer(d, body);
    expect(result.ok && result.offer.status).toBe("draft");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "offer.created", locale: "zh-HK", ipHash: "hash", entityType: "offer" });
    expect(Object.keys(events[0].payload ?? {}).sort()).toEqual(["location_id", "offer_id", "revision"]);
    expect(JSON.stringify(events[0])).not.toContain("Lunch set");
    expect(JSON.stringify(events[0])).not.toContain("88");
  });
  it("refuses scope violations and viewers", async () => {
    expect(await createOffer(deps({ membership: scopedManager }).d, body)).toMatchObject({ ok: false, status: 403 });
    expect(await createOffer(deps({ membership: scopedManager }).d, { ...body, location_id: L2 })).toMatchObject({ ok: false, status: 403 });
    expect(await createOffer(deps({ membership: scopedManager }).d, { ...body, location_id: L1 })).toMatchObject({ ok: true });
    expect(await createOffer(deps({ membership: viewer }).d, body)).toMatchObject({ ok: false, status: 403 });
  });
  it("refuses unapproved or out-of-location photos", async () => {
    const pending = deps({}, { [ASSET]: { id: ASSET, location_id: null, rights_status: "needs_review" } }).d;
    expect(await createOffer(pending, { ...body, asset_ids: [ASSET] })).toEqual({ ok: false, status: 400, error: "assets_invalid" });
    const elsewhere = deps({}, { [ASSET]: { id: ASSET, location_id: L2, rights_status: "approved" } }).d;
    expect(await createOffer(elsewhere, { ...body, location_id: L1, asset_ids: [ASSET] })).toEqual({ ok: false, status: 400, error: "assets_invalid" });
    const usable = deps({}, { [ASSET]: { id: ASSET, location_id: L1, rights_status: "approved" } }).d;
    expect(await createOffer(usable, { ...body, location_id: L1, asset_ids: [ASSET] })).toMatchObject({ ok: true });
  });
  it("refuses another market's currency", async () => {
    expect(await createOffer(deps().d, { ...body, currency: "TWD" })).toEqual({ ok: false, status: 400, error: "currency_market_mismatch" });
  });
  it("reports a location that is not the workspace's", async () => {
    const { d } = deps();
    d.repo.create = async () => null;
    expect(await createOffer(d, { ...body, location_id: L1 })).toEqual({ ok: false, status: 400, error: "location_invalid" });
  });
});

describe("confirmOffer", () => {
  it("needs an end-date choice and a running offer", async () => {
    const noEnd = deps({ repo: fakeRepo(offerRow({ status: "draft", confirmed_at: null, ends_on: null })) }).d;
    expect(await confirmOffer(noEnd, offerRow().id, 1)).toEqual({ ok: false, status: 409, error: "end_date_required" });
    const ended = deps({ repo: fakeRepo(offerRow({ status: "draft", confirmed_at: null, ends_on: "2026-09-30", starts_on: "2026-09-01" })) }).d;
    expect(await confirmOffer(ended, offerRow().id, 1)).toEqual({ ok: false, status: 409, error: "offer_ended" });
  });
  it("confirms and audits", async () => {
    const { d, events } = deps({ repo: fakeRepo(offerRow({ status: "draft", confirmed_at: null })) });
    const result = await confirmOffer(d, offerRow().id, 1);
    expect(result.ok && result.offer.status).toBe("confirmed");
    expect(events.map((e) => e.event)).toEqual(["offer.confirmed"]);
  });
  it("refuses a stale revision", async () => {
    const { d } = deps({ repo: fakeRepo(offerRow({ status: "draft", confirmed_at: null, revision: 2 })) });
    expect(await confirmOffer(d, offerRow().id, 1)).toEqual({ ok: false, status: 409, error: "offer_conflict" });
  });
  it("re-checks photo rights", async () => {
    const { d } = deps({ repo: fakeRepo(offerRow({ status: "draft", confirmed_at: null, asset_ids: [ASSET] })) }, { [ASSET]: { id: ASSET, location_id: null, rights_status: "rejected" } });
    expect(await confirmOffer(d, offerRow().id, 1)).toEqual({ ok: false, status: 409, error: "assets_invalid" });
  });
});

describe("updateOffer and archiveOffer", () => {
  it("returns a confirmed offer to draft at the next revision", async () => {
    const { d, events } = deps({ repo: fakeRepo(offerRow()) });
    const result = await updateOffer(d, offerRow().id, 1, { ...body, price_amount: 98 });
    expect(result.ok && [result.offer.status, result.offer.revision, result.offer.price_amount]).toEqual(["draft", 2, "98.00"]);
    expect(events.map((e) => e.event)).toEqual(["offer.updated"]);
  });
  it("refuses a stale revision", async () => {
    const { d } = deps({ repo: fakeRepo(offerRow({ revision: 3 })) });
    expect(await updateOffer(d, offerRow().id, 1, body)).toEqual({ ok: false, status: 409, error: "offer_conflict" });
  });
  it("refuses edits after archive", async () => {
    const { d } = deps({ repo: fakeRepo(offerRow()) });
    expect(await archiveOffer(d, offerRow().id)).toMatchObject({ ok: true, offer: { status: "archived" } });
    expect(await updateOffer(d, offerRow().id, 1, body)).toEqual({ ok: false, status: 409, error: "offer_archived" });
  });
  it("keeps a scoped manager off another location's offer", async () => {
    const { d } = deps({ membership: scopedManager, repo: fakeRepo(offerRow({ location_id: L2 })) });
    expect(await updateOffer(d, offerRow().id, 1, { ...body, location_id: L1 })).toMatchObject({ status: 403 });
    expect(await archiveOffer(d, offerRow().id)).toMatchObject({ status: 403 });
    expect(await confirmOffer(d, offerRow().id, 1)).toMatchObject({ status: 403 });
  });
  it("is 404 for an unknown offer", async () => {
    expect(await archiveOffer(deps().d, "missing")).toMatchObject({ status: 404 });
  });
});
