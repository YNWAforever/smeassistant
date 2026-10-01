import type { OfferRow } from "./types";
import { localDate } from "./dates";
import { bindingStatus, offerUsability } from "./usability";
import { workspaceMarket } from "./view";
import { isOfferTemplateKey } from "./workflow";
import { parseOfferBinding } from "@/lib/workspace/version-meta";

/**
 * Spec §5.4: a draft written from an earlier revision of an offer, or from
 * one that has since ended or been archived, can no longer be approved or
 * first-exported. A version already exported may still be copied again (it
 * counts nothing, as today). Nothing in SQL changes and no prior version is
 * mutated.
 *
 * Known limit: this check and the approve/export RPC are separate
 * statements, so an offer edited in the gap between them is not caught for
 * that one request. The SQL functions remain the authority on approval and
 * counting; this slice adds no migration functions.
 */
export type BindingRefusal = "offer_changed" | "offer_ended" | "offer_unconfirmed" | "offer_archived" | "offer_unbound";

export interface BindingRepository {
  versionBindingContext(versionId: string): Promise<{
    meta: unknown;
    first_exported_at: string | null;
    template_key: string;
    offer_id: string | null;
    workspace_id: string;
    timezone: string | null;
  } | null>;
  assistantOffer(workspaceId: string, offerId: string): Promise<OfferRow | null>;
}

const REFUSAL: Record<Exclude<ReturnType<typeof bindingStatus>, "current">, BindingRefusal> = {
  changed: "offer_changed",
  ended: "offer_ended",
  unconfirmed: "offer_unconfirmed",
  archived: "offer_archived",
  unbound: "offer_unbound",
};

export async function assertOfferBinding(
  repo: BindingRepository,
  versionId: string,
  opts: { firstExportOnly: boolean; now: Date },
): Promise<null | { status: 409; error: BindingRefusal }> {
  const ctx = await repo.versionBindingContext(versionId);
  if (!ctx || !isOfferTemplateKey(ctx.template_key)) return null;
  if (opts.firstExportOnly && ctx.first_exported_at) return null;
  const binding = parseOfferBinding(ctx.meta);
  const offer = binding ? await repo.assistantOffer(ctx.workspace_id, binding.id) : null;
  // The offer must still be the action's own: a binding to some other offer
  // (or an action whose offer was removed) is unbound.
  const linked = offer && ctx.offer_id === offer.id ? offer : null;
  const status = bindingStatus(binding, linked, localDate(ctx.timezone || "Asia/Hong_Kong", opts.now));
  if (status === "current") return null;
  console.warn("[offers] binding refused", { category: "offer_binding_refused", status });
  return { status: 409, error: REFUSAL[status] };
}

export interface EditBindingRepository extends BindingRepository {
  actionOfferContext(actionId: string): Promise<{
    template_key: string;
    offer_id: string | null;
    workspace_id: string;
    location_id: string | null;
    timezone: string | null;
    market: string | null;
  } | null>;
}

/**
 * The binding an owner edit (or redeemed assistant draft) of an offer action
 * records, decided on the server and never read from the client. Editing on
 * top of a base version inherits that version's binding, so an edit cannot
 * launder a stale draft into a current one. Without a base, it binds to the
 * offer's current revision when the offer is usable, and to nothing
 * otherwise (which cannot be approved).
 */
export async function offerBindingForEdit(
  repo: EditBindingRepository,
  actionId: string,
  baseVersionId: string | null,
  now: Date,
): Promise<{ offer: { id: string; revision: number } } | null> {
  const action = await repo.actionOfferContext(actionId);
  if (!action || !isOfferTemplateKey(action.template_key)) return null;
  if (baseVersionId) {
    const base = await repo.versionBindingContext(baseVersionId);
    const binding = base ? parseOfferBinding(base.meta) : null;
    return binding ? { offer: binding } : null;
  }
  const offer = action.offer_id ? await repo.assistantOffer(action.workspace_id, action.offer_id) : null;
  const usable =
    offer &&
    offerUsability(offer, {
      workspaceId: action.workspace_id,
      actionLocationId: action.location_id,
      market: workspaceMarket(action.market),
      today: localDate(action.timezone || "Asia/Hong_Kong", now),
    }) === "usable";
  return usable ? { offer: { id: offer.id, revision: offer.revision } } : null;
}
