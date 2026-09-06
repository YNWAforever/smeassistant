import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ list: vi.fn(), insert: vi.fn(), updateRights: vi.fn(), get: vi.fn(), upload: vi.fn(), remove: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/repositories/assets", () => ({ assetRepository: () => fake }));
vi.mock("@/lib/storage/private-blob", () => ({ createPrivateBlobStorage: () => fake }));
import { insertAsset, listAssets, safeFilename, isAllowedMime, storagePathFor, updateAssetRights } from "./assets";
const row = { id: "a1", workspace_id: "ws", location_id: "loc", kind: "image", storage_path: "ws/a1/lunch.jpg", filename: "lunch.jpg", rights_status: "needs_review", rights_confirmed_at: null };
const input = { id: "a1", workspaceId: "ws", locationId: null, kind: "image" as const, filename: "lunch.jpg", contentType: "image/jpeg", bytes: new Uint8Array([1]), altText: null, uploadedBy: "u" };
beforeEach(() => { vi.resetAllMocks(); fake.remove.mockResolvedValue(undefined); fake.list.mockResolvedValue([row]); fake.sign.mockResolvedValue("https://signed/fixture"); fake.insert.mockImplementation(async r => r); });
it("keeps safe filenames and MIME allowlist", () => { expect(safeFilename("../../lunch set:v2?.JPG", "image/jpeg")).toBe("lunch-setv2.JPG"); expect(safeFilename("", "image/png")).toBe("asset.png"); expect(isAllowedMime("image/svg+xml")).toBe(false); expect(storagePathFor("ws", "a", "menu.pdf")).toBe("ws/a/menu.pdf"); });
it("signs previews 60sec and permits explicit unsigned reads", async () => {
  expect(await listAssets("ws", [{ id: "loc", name: "Main" }])).toMatchObject([{ signedUrl: "https://signed/fixture", locationName: "Main" }]);
  expect(fake.sign).toHaveBeenCalledWith("workspace-assets", row.storage_path, 60);
  expect(await listAssets("ws", [], { signedUrls: false })).toMatchObject([{ signedUrl: null }]);
});
it("inserts needs_review only after private upload", async () => {
  await insertAsset(input);
  expect(fake.upload).toHaveBeenCalledWith("workspace-assets", row.storage_path, input.bytes, { contentType: "image/jpeg", overwrite: false });
  expect(fake.insert).toHaveBeenCalledWith(expect.objectContaining({ rights_status: "needs_review", rights_confirmed_at: null, storage_path: row.storage_path }));
});
it("compensates for failed SQL insertion", async () => {
  fake.insert.mockRejectedValue(new Error("sql"));
  await expect(insertAsset(input)).rejects.toThrow("asset_insert_failed");
  expect(fake.remove).toHaveBeenCalledWith("workspace-assets", [row.storage_path]);
});
it("does not insert if upload fails", async () => { fake.upload.mockRejectedValue(new Error("storage")); await expect(insertAsset(input)).rejects.toThrow("asset_storage_upload_failed"); expect(fake.insert).not.toHaveBeenCalled(); });
it("does not sign a tampered foreign workspace path", async () => { fake.list.mockResolvedValue([{ ...row, storage_path: "other/a1/lunch.jpg" }]); expect(await listAssets("ws")).toMatchObject([{ signedUrl: null }]); expect(fake.sign).not.toHaveBeenCalled(); });
it("keeps signing failures distinct from SQL failure", async () => { fake.sign.mockRejectedValue(new Error("storage")); expect(await listAssets("ws")).toMatchObject([{ signedUrl: null }]); fake.list.mockRejectedValue(new Error("sql")); await expect(listAssets("ws")).rejects.toThrow(); });
it("passes explicit rights decision with timestamp to tenant-scoped repository", async () => { const now = new Date("2026-09-06T00:00:00Z"); fake.updateRights.mockResolvedValue(row); await updateAssetRights({ workspaceId: "ws", assetId: "a1", rightsStatus: "approved", now }); expect(fake.updateRights).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws", assetId: "a1", rightsStatus: "approved" }), now.toISOString()); });
