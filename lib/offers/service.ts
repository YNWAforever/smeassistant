import { roleAtLeast, type Membership } from "@/lib/auth";
import { localized } from "@/lib/domain";
import { freshnessText } from "@/lib/workspace/actions";
import { templateByKey } from "@/lib/workspace/templates";
import { gateBlockingInputs } from "@/lib/workspace/workflow-inputs";
import { notStarted } from "./dates";
import { offerPriceDisplay } from "./format";
import { offerUsability } from "./usability";
import { isOfferTemplateKey, type OfferTemplateKey } from "./workflow";
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
  assets: { get(workspaceId: string, id: string): Promise<{ id: string; location_id: string | null; rights_status: string; alt_text?: string | null } | null> };
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

export interface PrepareDraftsDeps extends OfferServiceDeps {
  actions: { createOfferAction(row: Record<string, unknown>): Promise<{ id: string; created: boolean }> };
}

export type PrepareDraftsResult =
  | { ok: true; actions: Array<{ templateKey: OfferTemplateKey; actionId: string; created: boolean }> }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/** One open action per (offer, channel), so a retry or a second tab reuses it. */
export function offerDedupeKey(workspaceId: string, locationId: string | null, templateKey: OfferTemplateKey, offerId: string): string {
  return `${workspaceId}:${locationId ?? "all"}:${templateKey}:offer:${offerId}`;
}

/**
 * Spec §5.2: creates (or reuses) one ordinary action per chosen channel for a
 * confirmed, current offer. It never calls the model -- the client runs each
 * action through the existing POST /api/actions/[id]/run, one at a time -- so
 * a failed channel is retried alone and finished ones are never recounted.
 */
export async function prepareOfferDrafts(deps: PrepareDraftsDeps, offerId: string, templateKeys: unknown): Promise<PrepareDraftsResult> {
  if (!Array.isArray(templateKeys) || templateKeys.length === 0 || !templateKeys.every(isOfferTemplateKey)) {
    return { ok: false, status: 400, error: "template_keys is invalid" };
  }
  const keys = [...new Set(templateKeys)];
  const offer = await deps.repo.get(deps.workspace.id, offerId);
  if (!offer) return NOT_FOUND;
  if (!canManageOfferAt(deps.membership, offer.location_id)) return FORBIDDEN;
  const today = localDate(deps.workspace.timezone, deps.now);
  const usability = offerUsability(offer, { workspaceId: deps.workspace.id, actionLocationId: offer.location_id, market: deps.workspace.market, today });
  if (usability !== "usable") return { ok: false, status: 409, error: usability };

  // The first of the offer's photos that is still approved and usable at its
  // location pre-fills the Instagram draft; otherwise that action waits for
  // the asset picker or the text-only choice.
  const scope = assetLocationScope(deps.membership);
  let photo: { asset_id: string; alt_text: string } | null = null;
  for (const id of offer.asset_ids) {
    const asset = await deps.assets.get(deps.workspace.id, id);
    if (asset && asset.rights_status === "approved" && assetUsableByAction(asset, offer.location_id, scope)) {
      photo = { asset_id: asset.id, alt_text: asset.alt_text ?? "" };
      break;
    }
  }

  const observedAt = offer.confirmed_at ?? deps.now.toISOString();
  const results: Array<{ templateKey: OfferTemplateKey; actionId: string; created: boolean }> = [];
  for (const templateKey of keys) {
    const template = templateByKey(templateKey);
    const provided: Record<string, unknown> = templateKey === "offer-social-post" && photo ? { ...photo } : {};
    // The gate as the run will see it: offer_confirmed is satisfied (checked
    // above), and an Instagram draft without a usable photo needs one or the
    // text-only choice first.
    const satisfied = new Set(["offer_confirmed", ...(provided.asset_id ? ["asset_or_text_only"] : [])]);
    const blocking = gateBlockingInputs(template, provided, satisfied);
    const created = await deps.actions.createOfferAction({
      workspace_id: deps.workspace.id,
      location_id: offer.location_id,
      template_key: templateKey,
      source: "owner_objective",
      source_finding_keys: [],
      title: template.title,
      summary: template.summary,
      evidence: {
        factType: "Recommended",
        source: "Owner-confirmed offer",
        value: offerPriceDisplay(offer) ?? "",
        detail: localized(offer.title, offer.title),
        observedAt,
        freshness: freshnessText(observedAt, deps.now),
      },
      priority: "medium",
      priority_score: 50,
      priority_factors: [],
      effort_minutes: template.effortMinutes,
      required_inputs: template.requiredInputs,
      provided_inputs: provided,
      action_state: blocking.length ? "needs_input" : "recommended",
      measurement_state: "not_eligible",
      capability: template.capability,
      dedupe_key: offerDedupeKey(deps.workspace.id, offer.location_id, templateKey, offer.id),
      offer_id: offer.id,
      due_at: notStarted(offer, today) ? `${offer.starts_on}T00:00:00.000Z` : null,
    });
    if (created.created) {
      await deps.audit({
        workspaceId: deps.workspace.id,
        locationId: offer.location_id,
        actorType: "user",
        actorId: deps.membership.userId,
        event: "action.updated",
        entityType: "action",
        entityId: created.id,
        locale: deps.locale,
        ipHash: deps.ipHash,
        payload: { change: "created", source: "offer", template_key: templateKey, offer_id: offer.id },
      });
    }
    results.push({ templateKey, actionId: created.id, created: created.created });
  }
  return { ok: true, actions: results };
}
