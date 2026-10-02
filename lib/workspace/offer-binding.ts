/**
 * The offer binding on a version's meta (docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md
 * §1.3). Applied by `artifactRepository.createOutputVersion`, the gateway every
 * version passes through: an owner edit and an assistant rewrite via
 * `createVersion`, and an agent run via `actionRunRepository().finish`.
 *
 * approve/export (neon/migrations/0011_offers.sql `offer_current_for_version`)
 * refuse a version of an offer action unless `meta.offer_revision` is a JSON
 * integer equal to the confirmed offer's current revision, so what this writes
 * decides which drafts can ever be approved:
 *
 * 1. Incoming `offer_id` / `offer_revision` are always removed: a caller can
 *    never name the revision itself.
 * 2. A non-offer action keeps none.
 * 3. An agent run records the revision it actually read (`offerRevision`).
 * 4. Any other version inherits its base version's revision, and only when the
 *    base recorded this same offer. A hand edit therefore never makes a stale
 *    draft current; only a new run against the current offer does.
 * 5. Otherwise none, which approve/export treat as stale (fail closed).
 */
export interface OfferBindingInput {
  actionOfferId: string | null;
  offerRevision: number | null | undefined;
  baseMeta: Record<string, unknown> | null;
}

export function bindOfferMeta(meta: Record<string, unknown>, input: OfferBindingInput): Record<string, unknown> {
  const rest = { ...meta };
  delete rest.offer_id;
  delete rest.offer_revision;
  if (input.actionOfferId === null) return rest;
  if (Number.isInteger(input.offerRevision)) return { ...rest, offer_id: input.actionOfferId, offer_revision: input.offerRevision };
  const base = input.baseMeta;
  if (base && base.offer_id === input.actionOfferId && Number.isInteger(base.offer_revision)) {
    return { ...rest, offer_id: input.actionOfferId, offer_revision: base.offer_revision };
  }
  return rest;
}
