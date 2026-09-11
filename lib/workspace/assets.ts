import { assetRepository } from "@/lib/repositories/assets";
import { createPrivateBlobStorage } from "@/lib/storage/private-blob";
import type { LocationSummary } from "@/lib/workspace/queries";

/**
 * Brand assets (CLAUDE.md §3.3 `assets`, Phase 4 item 4). Files live in the
 * private `workspace-assets` bucket under `${workspaceId}/${assetId}/${filename}`;
 * the row is the source of truth for rights. Upload never implies permission
 * to publish: `rights_status` starts at `needs_review` and only an explicit
 * PATCH sets `rights_confirmed_at`. The caller has already authorised the
 * member (service-role client, §3.9); this module does no auth of its own.
 */
export const ASSET_BUCKET = "workspace-assets";
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export const SIGNED_URL_SECONDS = 60;

export type AssetKind = "image" | "document" | "menu";
export type RightsStatus = "approved" | "needs_review" | "rejected";

/** Mirrors the bucket's allowed_mime_types; extension used for a safe filename fallback. */
export const ALLOWED_ASSET_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const ASSET_KINDS: AssetKind[] = ["image", "document", "menu"];

export interface AssetRow {
  id: string;
  workspace_id: string;
  location_id: string | null;
  kind: AssetKind;
  storage_path: string;
  filename: string;
  alt_text: string | null;
  rights_status: RightsStatus;
  rights_confirmed_at: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface AssetItem extends AssetRow {
  /** 60-second signed URL for the thumbnail/preview; null when signing failed or was skipped. */
  signedUrl: string | null;
  locationName: string | null;
}

export function isAllowedMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_ASSET_MIME, mime);
}

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === "string" && (ASSET_KINDS as string[]).includes(value);
}

/** Keep the user's name readable but path-safe: no separators, no control chars, bounded length, extension from the mime type when missing. */
export function safeFilename(name: string, mime: string): string {
  const ext = ALLOWED_ASSET_MIME[mime] ?? "bin";
  const trimmed = name.split(/[\\/]/).pop() ?? "";
  let cleaned = trimmed.replace(/[\x00-\x1f"'<>?*:|%#]/g, "").replace(/\s+/g, "-").replace(/^\.+/, "").slice(0, 120);
  if (!cleaned) cleaned = `asset.${ext}`;
  if (!/\.[A-Za-z0-9]{2,5}$/.test(cleaned)) cleaned = `${cleaned}.${ext}`;
  return cleaned;
}

export function storagePathFor(workspaceId: string, assetId: string, filename: string): string {
  return `${workspaceId}/${assetId}/${filename}`;
}

export async function listAssets(
  workspaceId: string,
  locations: Array<Pick<LocationSummary, "id" | "name">> = [],
  opts: { signedUrls?: boolean } = {},
): Promise<AssetItem[]> {
  const rows = await assetRepository().list(workspaceId);
  const byLocation = new Map(locations.map(l => [l.id, l.name]));
  return Promise.all(rows.map(async row => ({ ...row,
    signedUrl: opts.signedUrls !== false && row.storage_path.startsWith(`${workspaceId}/${row.id}/`) ? await signedUrlFor(row.storage_path) : null,
    locationName: row.location_id ? byLocation.get(row.location_id) ?? null : null,
  })));
}
/**
 * Which approved assets an action may attach (P2.3 item 15).
 *
 * The convention is the one `components/workspace/assets-view.tsx` already
 * uses, and getting it backwards is the trap here: `location_id === null`
 * means the asset belongs to the WHOLE workspace and is usable everywhere --
 * it is not an unscoped orphan to be filtered out. Only a location-scoped
 * asset is restricted, and then to its own location.
 *
 * An all-locations action (`actionLocationId === null`) therefore gets the
 * workspace-wide assets only: its output goes everywhere, so one shop's photo
 * would be wrong on the others.
 */
export function assetUsableByAction(
  asset: { location_id: string | null },
  actionLocationId: string | null,
  locationScope: readonly string[] | null,
): boolean {
  if (asset.location_id === null) return true;
  if (asset.location_id !== actionLocationId) return false;
  return locationScope === null || locationScope.includes(asset.location_id);
}

/** Only a manager carries a location scope; owners and viewers see the workspace. */
export function assetLocationScope(membership: { role: string; locationScope?: readonly string[] | null }): readonly string[] | null {
  return membership.role === "manager" && membership.locationScope ? membership.locationScope : null;
}

export async function signedUrlFor(storagePath: string): Promise<string | null> {
  try { return await createPrivateBlobStorage().sign(ASSET_BUCKET, storagePath, SIGNED_URL_SECONDS); }
  catch { return null; }
}

export interface InsertAssetInput {
  workspaceId: string;
  locationId: string | null;
  kind: AssetKind;
  filename: string;
  contentType: string;
  bytes: Uint8Array | ArrayBuffer | Blob;
  altText: string | null;
  uploadedBy: string;
  /** Test hook; defaults to crypto.randomUUID(). */
  id?: string;
}

/** Upload the object first, then insert the row; a failed insert removes the object so the bucket never holds orphans. */
export async function insertAsset(input: InsertAssetInput): Promise<AssetRow> {
  const assetId = input.id ?? crypto.randomUUID();
  const filename = safeFilename(input.filename, input.contentType);
  const storagePath = storagePathFor(input.workspaceId, assetId, filename);
  const storage = createPrivateBlobStorage();
  try { await storage.upload(ASSET_BUCKET, storagePath, input.bytes, { contentType: input.contentType, overwrite: false }); }
  catch { throw new Error("asset_storage_upload_failed"); }
  const row = {
    id: assetId,
    workspace_id: input.workspaceId,
    location_id: input.locationId,
    kind: input.kind,
    storage_path: storagePath,
    filename,
    alt_text: input.altText,
    rights_status: "needs_review" as RightsStatus,
    rights_confirmed_at: null,
    uploaded_by: input.uploadedBy,
  };
  try { return await assetRepository().insert(row); }
  catch {
    await storage.remove(ASSET_BUCKET, [storagePath]).catch(() => undefined);
    throw new Error("asset_insert_failed");
  }
}

export interface UpdateRightsInput {
  workspaceId: string;
  assetId: string;
  rightsStatus: "approved" | "rejected";
  altText?: string | null;
  now?: Date;
}

/** Sets rights_confirmed_at with the decision; returns null when the asset is not in this workspace. */
export async function updateAssetRights(input: UpdateRightsInput): Promise<AssetRow | null> {
  return assetRepository().updateRights(input, (input.now ?? new Date()).toISOString());
}
export async function getAsset(workspaceId: string, assetId: string): Promise<AssetRow | null> {
  return assetRepository().get(workspaceId, assetId);
}
