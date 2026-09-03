import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { insertAsset, isAllowedMime, listAssets, safeFilename, storagePathFor, updateAssetRights } from "./assets";

type Row = Record<string, unknown>;

function fakeDb(state: { rows: Row[]; insertError?: { message: string } | null; uploadError?: { message: string } | null }) {
  const upload = vi.fn(async () => ({ data: { path: "x" }, error: state.uploadError ?? null }));
  const remove = vi.fn(async () => ({ data: null, error: null }));
  const createSignedUrls = vi.fn(async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })), error: null }));
  const inserted: Row[] = [];
  const updates: Array<{ patch: Row; filters: Row }> = [];
  const db = {
    storage: { from: () => ({ upload, remove, createSignedUrls, createSignedUrl: vi.fn() }) },
    from: () => {
      const filters: Row = {};
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      let mode: "select" | "insert" | "update" = "select";
      let patch: Row = {};
      Object.assign(chain, {
        select: () => chain,
        order: self,
        eq: (c: string, v: unknown) => { filters[c] = v; return chain; },
        insert: (row: Row) => { mode = "insert"; inserted.push(row); return chain; },
        update: (p: Row) => { mode = "update"; patch = p; return chain; },
        returns: () => Promise.resolve({ data: state.rows, error: null }),
        single: () => Promise.resolve(state.insertError ? { data: null, error: state.insertError } : { data: { ...inserted.at(-1), created_at: "2026-09-03T00:00:00Z" }, error: null }),
        maybeSingle: () => {
          if (mode === "update") {
            updates.push({ patch, filters });
            const row = state.rows.find((r) => r.id === filters.id && r.workspace_id === filters.workspace_id);
            return Promise.resolve({ data: row ? { ...row, ...patch } : null, error: null });
          }
          return Promise.resolve({ data: state.rows.find((r) => r.id === filters.id) ?? null, error: null });
        },
      });
      return chain;
    },
  };
  return { db: db as unknown as SupabaseClient, upload, remove, createSignedUrls, inserted, updates };
}

describe("asset helpers", () => {
  it("allows only the bucket's mime types and builds path-safe filenames", () => {
    expect(isAllowedMime("image/jpeg")).toBe(true);
    expect(isAllowedMime("image/svg+xml")).toBe(false);
    expect(safeFilename("../../lunch set:v2?.JPG", "image/jpeg")).toBe("lunch-setv2.JPG");
    expect(safeFilename("", "image/png")).toBe("asset.png");
    expect(safeFilename("menu", "application/pdf")).toBe("menu.pdf");
    expect(storagePathFor("ws", "as", "menu.pdf")).toBe("ws/as/menu.pdf");
  });
});

describe("listAssets", () => {
  it("signs every storage path for 60 seconds and resolves the location name", async () => {
    const { db, createSignedUrls } = fakeDb({ rows: [{ id: "a1", workspace_id: "ws", location_id: "loc-1", kind: "image", storage_path: "ws/a1/lunch.jpg", filename: "lunch.jpg", alt_text: null, rights_status: "needs_review", rights_confirmed_at: null, uploaded_by: "u", created_at: "2026-09-03T00:00:00Z" }] });
    const items = await listAssets(db, "ws", [{ id: "loc-1", name: "Yik Yam Street" }]);
    expect(createSignedUrls).toHaveBeenCalledWith(["ws/a1/lunch.jpg"], 60);
    expect(items[0]).toMatchObject({ signedUrl: "https://signed/ws/a1/lunch.jpg", locationName: "Yik Yam Street" });
    const unsigned = await listAssets(db, "ws", [], { signedUrls: false });
    expect(unsigned[0].signedUrl).toBeNull();
  });
});

describe("insertAsset", () => {
  it("uploads to `${workspaceId}/${assetId}/${filename}` and inserts a needs_review row", async () => {
    const { db, upload, inserted } = fakeDb({ rows: [] });
    const row = await insertAsset(db, { id: "asset-1", workspaceId: "ws", locationId: null, kind: "image", filename: "lunch set.jpg", contentType: "image/jpeg", bytes: new Uint8Array([1]), altText: "Lunch", uploadedBy: "u1" });
    expect(upload).toHaveBeenCalledWith("ws/asset-1/lunch-set.jpg", expect.anything(), expect.objectContaining({ contentType: "image/jpeg", upsert: false }));
    expect(inserted[0]).toMatchObject({ id: "asset-1", workspace_id: "ws", storage_path: "ws/asset-1/lunch-set.jpg", rights_status: "needs_review", rights_confirmed_at: null, uploaded_by: "u1" });
    expect(row.filename).toBe("lunch-set.jpg");
  });

  it("removes the uploaded object when the row insert fails", async () => {
    const { db, remove } = fakeDb({ rows: [], insertError: { message: "boom" } });
    await expect(insertAsset(db, { id: "asset-2", workspaceId: "ws", locationId: null, kind: "menu", filename: "menu.pdf", contentType: "application/pdf", bytes: new Uint8Array([1]), altText: null, uploadedBy: "u1" })).rejects.toThrow("asset_insert_failed");
    expect(remove).toHaveBeenCalledWith(["ws/asset-2/menu.pdf"]);
  });

  it("does not insert a row when the upload fails", async () => {
    const { db, inserted } = fakeDb({ rows: [], uploadError: { message: "denied" } });
    await expect(insertAsset(db, { id: "asset-3", workspaceId: "ws", locationId: null, kind: "image", filename: "a.png", contentType: "image/png", bytes: new Uint8Array([1]), altText: null, uploadedBy: "u1" })).rejects.toThrow("asset_storage_upload_failed");
    expect(inserted).toHaveLength(0);
  });
});

describe("updateAssetRights", () => {
  it("sets rights_status and rights_confirmed_at scoped to the workspace", async () => {
    const { db, updates } = fakeDb({ rows: [{ id: "a1", workspace_id: "ws", location_id: null, rights_status: "needs_review", rights_confirmed_at: null, filename: "a.jpg" }] });
    const now = new Date("2026-09-03T10:00:00Z");
    const updated = await updateAssetRights(db, { workspaceId: "ws", assetId: "a1", rightsStatus: "approved", altText: "Lunch", now });
    expect(updates[0].patch).toEqual({ rights_status: "approved", rights_confirmed_at: now.toISOString(), alt_text: "Lunch" });
    expect(updates[0].filters).toEqual({ id: "a1", workspace_id: "ws" });
    expect(updated?.rights_status).toBe("approved");
    expect(await updateAssetRights(db, { workspaceId: "other", assetId: "a1", rightsStatus: "rejected" })).toBeNull();
  });
});
