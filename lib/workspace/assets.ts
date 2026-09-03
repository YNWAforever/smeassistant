import type { SupabaseClient } from "@supabase/supabase-js";
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
  db: SupabaseClient,
  workspaceId: string,
  locations: Array<Pick<LocationSummary, "id" | "name">> = [],
  opts: { signedUrls?: boolean } = {},
): Promise<AssetItem[]> {
  const { data, error } = await db.from("assets").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).returns<AssetRow[]>();
  if (error) throw new Error("assets lookup failed");
  const rows = data ?? [];
  const byLocation = new Map(locations.map((l) => [l.id, l.name]));
  let signed = new Map<string, string | null>();
  if (opts.signedUrls !== false && rows.length) {
    const result = await db.storage.from(ASSET_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_SECONDS);
    if (!result.error && result.data) signed = new Map(result.data.filter((item) => item.signedUrl && item.path).map((item) => [item.path as string, item.signedUrl]));
  }
  return rows.map((row) => ({
    ...row,
    signedUrl: signed.get(row.storage_path) ?? null,
    locationName: row.location_id ? byLocation.get(row.location_id) ?? null : null,
  }));
}

export async function signedUrlFor(db: SupabaseClient, storagePath: string): Promise<string | null> {
  const { data, error } = await db.storage.from(ASSET_BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
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
export async function insertAsset(db: SupabaseClient, input: InsertAssetInput): Promise<AssetRow> {
  const assetId = input.id ?? crypto.randomUUID();
  const filename = safeFilename(input.filename, input.contentType);
  const storagePath = storagePathFor(input.workspaceId, assetId, filename);
  const bucket = db.storage.from(ASSET_BUCKET);
  const upload = await bucket.upload(storagePath, input.bytes, { contentType: input.contentType, upsert: false, cacheControl: "0" });
  if (upload.error) throw new Error("asset_storage_upload_failed");
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
  const { data, error } = await db.from("assets").insert(row).select("*").single<AssetRow>();
  if (error || !data) {
    await bucket.remove([storagePath]).catch(() => undefined);
    throw new Error("asset_insert_failed");
  }
  return data;
}

export interface UpdateRightsInput {
  workspaceId: string;
  assetId: string;
  rightsStatus: "approved" | "rejected";
  altText?: string | null;
  now?: Date;
}

/** Sets rights_confirmed_at with the decision; returns null when the asset is not in this workspace. */
export async function updateAssetRights(db: SupabaseClient, input: UpdateRightsInput): Promise<AssetRow | null> {
  const patch: Record<string, unknown> = {
    rights_status: input.rightsStatus,
    rights_confirmed_at: (input.now ?? new Date()).toISOString(),
  };
  if (input.altText !== undefined) patch.alt_text = input.altText;
  const { data, error } = await db.from("assets").update(patch).eq("id", input.assetId).eq("workspace_id", input.workspaceId).select("*").maybeSingle<AssetRow>();
  if (error) throw new Error("asset_update_failed");
  return data ?? null;
}

export async function getAsset(db: SupabaseClient, workspaceId: string, assetId: string): Promise<AssetRow | null> {
  const { data, error } = await db.from("assets").select("*").eq("id", assetId).eq("workspace_id", workspaceId).maybeSingle<AssetRow>();
  if (error) throw new Error("asset_lookup_failed");
  return data ?? null;
}
