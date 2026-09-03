import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultBrand, getBrand, parseBrandBody, putBrand } from "./brand";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  row: null as Row | null,
  upserts: [] as Row[],
  audits: [] as Row[],
}));

function client(): SupabaseClient {
  const from = (table: string) => {
    let upserted: Row | null = null;
    let inserted: Row | null = null;
    const terminal = () => {
      if (table === "brand_profiles") {
        if (upserted) {
          state.upserts.push(upserted);
          state.row = { ...upserted };
          return { data: state.row, error: null };
        }
        return { data: state.row, error: null };
      }
      if (table === "audit_events") {
        if (inserted) state.audits.push(inserted);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: self,
      upsert: (row: Row) => {
        upserted = row;
        return chain;
      },
      insert: (row: Row) => {
        inserted = row;
        return Promise.resolve(terminal());
      },
      single: () => Promise.resolve(terminal()),
      maybeSingle: () => Promise.resolve(terminal()),
    });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

beforeEach(() => {
  state.row = null;
  state.upserts = [];
  state.audits = [];
});

const VALID = { voice: "professional", approved_claims: ["Est. 1998", " Est. 1998 ", ""], prohibited_terms: ["best"], languages: ["zh-HK", "en"], facts: { opening_hours: "11:00-22:00" } };

describe("parseBrandBody", () => {
  it("accepts a well-formed body, trimming and deduplicating list entries", () => {
    expect(parseBrandBody(VALID)).toEqual({
      ok: true,
      brand: { voice: "professional", approved_claims: ["Est. 1998"], prohibited_terms: ["best"], languages: ["zh-HK", "en"], facts: { opening_hours: "11:00-22:00" } },
    });
  });

  it("rejects an unknown voice, language, oversized lists and non-string facts", () => {
    expect(parseBrandBody({ ...VALID, voice: "shouty" })).toMatchObject({ ok: false, error: expect.stringContaining("voice") });
    expect(parseBrandBody({ ...VALID, languages: ["fr"] })).toMatchObject({ ok: false, error: expect.stringContaining("languages") });
    expect(parseBrandBody({ ...VALID, languages: [] })).toMatchObject({ ok: false, error: expect.stringContaining("languages") });
    expect(parseBrandBody({ ...VALID, approved_claims: Array.from({ length: 51 }, () => "x") })).toMatchObject({ ok: false });
    expect(parseBrandBody({ ...VALID, prohibited_terms: [1] })).toMatchObject({ ok: false });
    expect(parseBrandBody({ ...VALID, facts: { a: 1 } })).toMatchObject({ ok: false, error: expect.stringContaining("facts") });
    expect(parseBrandBody({ ...VALID, facts: [] })).toMatchObject({ ok: false });
  });

  it("defaults omitted lists to empty", () => {
    expect(parseBrandBody({ voice: "warm", languages: ["zh-TW"] })).toEqual({
      ok: true,
      brand: { voice: "warm", approved_claims: [], prohibited_terms: [], languages: ["zh-TW"], facts: {} },
    });
  });
});

describe("getBrand", () => {
  it("returns the defaults when no row exists yet", async () => {
    expect(await getBrand(client(), "ws-1")).toEqual(defaultBrand("ws-1"));
  });

  it("shapes a stored row and drops unknown values", async () => {
    state.row = { workspace_id: "ws-1", voice: "direct", approved_claims: ["a"], prohibited_terms: null, languages: ["en", "fr"], facts: { k: "v", n: 1 }, updated_at: "2026-09-04T00:00:00Z" };
    expect(await getBrand(client(), "ws-1")).toEqual({
      workspaceId: "ws-1",
      voice: "direct",
      approvedClaims: ["a"],
      prohibitedTerms: [],
      languages: ["en"],
      facts: { k: "v" },
      updatedAt: "2026-09-04T00:00:00Z",
    });
  });
});

describe("putBrand", () => {
  it("upserts on workspace_id and records brand.updated", async () => {
    const parsed = parseBrandBody(VALID);
    if (!parsed.ok) throw new Error("fixture invalid");
    const brand = await putBrand(client(), { workspaceId: "ws-1", actorId: "user-1", brand: parsed.brand, locale: "en", now: new Date("2026-09-04T09:00:00Z") });
    expect(state.upserts[0]).toMatchObject({ workspace_id: "ws-1", voice: "professional", approved_claims: ["Est. 1998"], languages: ["zh-HK", "en"], facts: { opening_hours: "11:00-22:00" }, updated_at: "2026-09-04T09:00:00.000Z" });
    expect(brand).toMatchObject({ workspaceId: "ws-1", voice: "professional", approvedClaims: ["Est. 1998"], updatedAt: "2026-09-04T09:00:00.000Z" });
    expect(state.audits[0]).toMatchObject({
      workspace_id: "ws-1",
      actor_type: "user",
      actor_id: "user-1",
      event: "brand.updated",
      entity_type: "brand_profile",
      entity_id: "ws-1",
      payload: { locale: "en", voice: "professional", languages: ["zh-HK", "en"], approved_claims: 1, prohibited_terms: 1, facts: 1 },
    });
  });
});
