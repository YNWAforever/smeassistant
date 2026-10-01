import { roleAtLeast, type Membership } from "@/lib/auth";
import type { OfferRepository } from "@/lib/repositories/offers";
import { assetLocationScope, assetUsableByAction } from "@/lib/workspace/assets";
import type { AuditEventInput } from "@/lib/workspace/audit";
import { localDate } from "./dates";
import { confirmable, parseOfferBody } from "./validate";
import type { OfferInput, OfferRow } from "./types";

/**
 * Offer writes (spec §5.1, §6): validate → scope → repository → audit. Every
 * dependency is injected so the routes stay thin and the rules are testable
 * without a database. The audit payload never carries offer text, prices or
 * claims -- only ids, the revision and the location.
 */
export interface OfferServiceDeps {
  repo: OfferRepository;
  assets: { get(workspaceId: string, id: string): Promise<{ id: string; location_id: string | null; rights_status: string } | null> };
  audit: (input: AuditEventInput) => Promise<void>;
  membership: NonNullable<Membership>;
  workspace: { id: string; market: "hk" | "tw"; timezone: string };
  now: Date;
  locale: string;
  ipHash: string | null;
}

export type OfferResult = { ok: true; offer: OfferRow } | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/**
 * Spec D8. Owners, and managers for a location in their scope. A manager with
 * a non-null location_scope can never manage a workspace-wide offer: its facts
 * would reach every location's drafts. (inLocationScope(m, null) is true for
 * such a manager, which is right for reading but not for this.)
 */
export function canManageOfferAt(membership: NonNullable<Membership>, locationId: string | null): boolean {
  if (!roleAtLeast(membership.role, "manager")) return false;
  if (membership.role !== "manager" || membership.locationScope === null) return true;
  return locationId !== null && membership.locationScope.includes(locationId);
}

/** What a member may read: a scoped manager sees in-scope and workspace-wide offers. */
export function offerReadScope(membership: NonNullable<Membership>): readonly string[] | null {
  return membership.role === "manager" ? membership.locationScope : null;
}

async function assetsUsable(deps: OfferServiceDeps, offer: Pick<OfferInput, "asset_ids" | "location_id">): Promise<boolean> {
  const scope = assetLocationScope(deps.membership);
  for (const id of offer.asset_ids) {
    const asset = await deps.assets.get(deps.workspace.id, id);
    if (!asset || asset.rights_status !== "approved" || !assetUsableByAction(asset, offer.location_id, scope)) return false;
  }
  return true;
}

async function audit(deps: OfferServiceDeps, event: "offer.created" | "offer.updated" | "offer.confirmed" | "offer.archived", offer: OfferRow): Promise<void> {
  await deps.audit({
    workspaceId: deps.workspace.id,
    locationId: offer.location_id,
    actorType: "user",
    actorId: deps.membership.userId,
    event,
    entityType: "offer",
    entityId: offer.id,
    locale: deps.locale,
    ipHash: deps.ipHash,
    payload: { offer_id: offer.id, revision: offer.revision, location_id: offer.location_id },
  });
}

const FORBIDDEN = { ok: false, status: 403, error: "forbidden" } as const;
const NOT_FOUND = { ok: false, status: 404, error: "offer_not_found" } as const;

export async function createOffer(deps: OfferServiceDeps, body: unknown): Promise<OfferResult> {
  const parsed = parseOfferBody(body, { market: deps.workspace.market });
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  if (!canManageOfferAt(deps.membership, parsed.offer.location_id)) return FORBIDDEN;
  if (!(await assetsUsable(deps, parsed.offer))) return { ok: false, status: 400, error: "assets_invalid" };
  const offer = await deps.repo.create({ ...parsed.offer, workspaceId: deps.workspace.id, createdBy: deps.membership.userId });
  if (!offer) return { ok: false, status: 400, error: "location_invalid" };
  await audit(deps, "offer.created", offer);
  return { ok: true, offer };
}

export async function updateOffer(deps: OfferServiceDeps, offerId: string, expectedRevision: number, body: unknown): Promise<OfferResult> {
  const existing = await deps.repo.get(deps.workspace.id, offerId);
  if (!existing) return NOT_FOUND;
  if (!canManageOfferAt(deps.membership, existing.location_id)) return FORBIDDEN;
  if (existing.status === "archived") return { ok: false, status: 409, error: "offer_archived" };
  const parsed = parseOfferBody(body, { market: deps.workspace.market });
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  if (!canManageOfferAt(deps.membership, parsed.offer.location_id)) return FORBIDDEN;
  if (!(await assetsUsable(deps, parsed.offer))) return { ok: false, status: 400, error: "assets_invalid" };
  const result = await deps.repo.update(deps.workspace.id, offerId, expectedRevision, parsed.offer);
  if (result === null) return NOT_FOUND;
  if (result === "conflict") return { ok: false, status: 409, error: "offer_conflict" };
  if (result === "archived") return { ok: false, status: 409, error: "offer_archived" };
  if (result === "location_invalid") return { ok: false, status: 400, error: "location_invalid" };
  await audit(deps, "offer.updated", result);
  return { ok: true, offer: result };
}

export async function confirmOffer(deps: OfferServiceDeps, offerId: string, expectedRevision: number): Promise<OfferResult> {
  const existing = await deps.repo.get(deps.workspace.id, offerId);
  if (!existing) return NOT_FOUND;
  if (!canManageOfferAt(deps.membership, existing.location_id)) return FORBIDDEN;
  if (existing.status === "archived") return { ok: false, status: 409, error: "offer_archived" };
  if (existing.revision !== expectedRevision) return { ok: false, status: 409, error: "offer_conflict" };
  // Confirming the same revision twice is a no-op, not a conflict.
  if (existing.status === "confirmed") return { ok: true, offer: existing };
  const refusal = confirmable(existing, localDate(deps.workspace.timezone, deps.now));
  if (refusal) return { ok: false, status: 409, error: refusal };
  // Rights or location can change after the offer was saved; confirm checks again.
  if (!(await assetsUsable(deps, existing))) return { ok: false, status: 409, error: "assets_invalid" };
  const result = await deps.repo.confirm(deps.workspace.id, offerId, expectedRevision, deps.membership.userId);
  if (result === null) return NOT_FOUND;
  if (result === "conflict") return { ok: false, status: 409, error: "offer_conflict" };
  await audit(deps, "offer.confirmed", result);
  return { ok: true, offer: result };
}

export async function archiveOffer(deps: OfferServiceDeps, offerId: string): Promise<OfferResult> {
  const existing = await deps.repo.get(deps.workspace.id, offerId);
  if (!existing) return NOT_FOUND;
  if (!canManageOfferAt(deps.membership, existing.location_id)) return FORBIDDEN;
  if (existing.status === "archived") return { ok: true, offer: existing };
  const result = await deps.repo.archive(deps.workspace.id, offerId);
  if (!result) return NOT_FOUND;
  await audit(deps, "offer.archived", result);
  return { ok: true, offer: result };
}
