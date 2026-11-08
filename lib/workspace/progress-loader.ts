import "server-only"

import { assetRepository } from "@/lib/repositories/assets"
import { brandRepository } from "@/lib/repositories/brand"
import { workspaceReadRepository } from "@/lib/repositories/workspace-read"
import { signedUrlFor } from "@/lib/workspace/assets"
import { buildProgress, profileLevel, type ProfileLevel, type Progress, type ShopPhoto } from "@/lib/workspace/progress"
import type { WorkspaceContext } from "@/lib/workspace/queries"

/**
 * The six-item shop profile (whole workspace) and up to `photoLimit` of the
 * shop's own confirmed photos (signed, this workspace's folder only). With a
 * location, photos are the workspace-wide ones plus that location's, as on
 * the Photos and menus page.
 */
async function loadProfileAndPhotos(ctx: WorkspaceContext, photoLimit: number, locationId: string | "all" = "all"): Promise<{ profile: ProfileLevel; photos: ShopPhoto[] }> {
  const id = ctx.workspace.id
  const [brand, connection, assets] = await Promise.all([
    brandRepository().get(id),
    workspaceReadRepository().latestConnection(id),
    assetRepository().list(id),
  ])
  const approvedImages = assets.filter((asset) => asset.kind === "image" && asset.rights_status === "approved")
  const profile = profileLevel({ brand, approvedPhotos: approvedImages.length, googleConnected: connection?.status === "active", instagramHandle: ctx.workspace.instagramHandle })
  const shown = locationId === "all" ? approvedImages : approvedImages.filter((asset) => !asset.location_id || asset.location_id === locationId)
  const signed = await Promise.all(shown.slice(0, photoLimit).map(async (asset) => ({
    id: asset.id,
    url: asset.storage_path.startsWith(`${id}/${asset.id}/`) ? await signedUrlFor(asset.storage_path) : null,
    alt: asset.alt_text ?? "",
  })))
  return { profile, photos: signed.filter((photo): photo is ShopPhoto => photo.url !== null) }
}

/**
 * Today's progress panel and photo strip. A failed read hides the panel
 * (null) rather than showing a wrong count or a badge the owner has not earned.
 */
export async function loadTodayProgress(ctx: WorkspaceContext, input: { monthDone: number; open: number; locationId: string | "all" }): Promise<{ progress: Progress | null; photos: ShopPhoto[] }> {
  try {
    const [signals, { profile, photos }] = await Promise.all([
      workspaceReadRepository().effortSignals(ctx.workspace.id, ctx.workspace.timezone),
      loadProfileAndPhotos(ctx, 4, input.locationId),
    ])
    return { progress: buildProgress({ signals, monthDone: input.monthDone, open: input.open, profile }), photos }
  } catch {
    console.error("[today-progress] read failed", { category: "workspace_query_failed" })
    return { progress: null, photos: [] }
  }
}

/** The Shop page header; null on a failed read so the page still lists its sections. */
export async function loadShopProfile(ctx: WorkspaceContext): Promise<{ profile: ProfileLevel; photo: ShopPhoto | null } | null> {
  try {
    const { profile, photos } = await loadProfileAndPhotos(ctx, 1)
    return { profile, photo: photos[0] ?? null }
  } catch {
    console.error("[shop-profile] read failed", { category: "workspace_query_failed" })
    return null
  }
}
