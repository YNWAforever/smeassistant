import "server-only";
import type { Membership } from "@/lib/auth";
import { offerRepository, type OfferActionRow } from "@/lib/repositories/offers";
import { assetLocationScope, listAssets } from "@/lib/workspace/assets";
import type { WorkspaceContext } from "@/lib/workspace/queries";
import type { ActionDetail } from "@/lib/workspace/queries-pages";
import { offerChannel } from "./channels";
import { localDate } from "./dates";
import type { OfferPromptFacts } from "./prompt-facts";
import { canManageOfferAt, offerReadScope } from "./service";
import type { BindingStatus, OfferChannel, OfferRow } from "./types";
import { bindingStatus } from "./usability";
import { toOfferView, type OfferView } from "./view";
import { OFFER_TEMPLATE_KEYS, isOfferTemplateKey, type OfferTemplateKey } from "./workflow";

/**
 * Server read models for the offer pages and the offer card on the action
 * page. Scope follows the routes: a scoped manager sees in-scope and
 * workspace-wide offers; managing still needs canManageOfferAt.
 */
export interface OfferPhoto { id: string; filename: string; locationId: string | null; altText: string | null }

function today(ctx: WorkspaceContext): string {
  return localDate(ctx.workspace.timezone, new Date());
}

export async function listOfferViews(ctx: WorkspaceContext, membership: NonNullable<Membership>, locale: string): Promise<OfferView[]> {
  const repo = offerRepository();
  const [rows, counts] = await Promise.all([repo.list(ctx.workspace.id, { locationIds: offerReadScope(membership) }), repo.draftCounts(ctx.workspace.id)]);
  const day = today(ctx);
  return rows.map((row) => toOfferView(row, { today: day, locale, draftCount: counts.get(row.id) ?? 0 }));
}

/** Approved images a manager may attach to an offer, with the location each belongs to. */
export async function offerPhotos(ctx: WorkspaceContext, membership: NonNullable<Membership>): Promise<OfferPhoto[]> {
  const assets = await listAssets(ctx.workspace.id, ctx.locations, { signedUrls: false }).catch(() => []);
  const scope = assetLocationScope(membership);
  return assets
    .filter((asset) => asset.rights_status === "approved" && asset.kind === "image")
    .filter((asset) => asset.location_id === null || scope === null || scope.includes(asset.location_id))
    .map((asset) => ({ id: asset.id, filename: asset.filename, locationId: asset.location_id, altText: asset.alt_text }));
}

export interface OfferChannelState {
  templateKey: OfferTemplateKey;
  channel: OfferChannel;
  action: OfferActionRow | null;
}

export interface OfferDetailModel {
  offer: OfferView;
  canManage: boolean;
  channels: OfferChannelState[];
}

export async function offerDetail(ctx: WorkspaceContext, membership: NonNullable<Membership>, offerId: string, locale: string): Promise<OfferDetailModel | null> {
  const repo = offerRepository();
  const row = await repo.get(ctx.workspace.id, offerId);
  if (!row) return null;
  const scope = offerReadScope(membership);
  if (scope !== null && row.location_id !== null && !scope.includes(row.location_id)) return null;
  const actions = await repo.offerActions(ctx.workspace.id, offerId);
  return {
    offer: toOfferView(row, { today: today(ctx), locale, draftCount: actions.length }),
    canManage: canManageOfferAt(membership, row.location_id),
    channels: OFFER_TEMPLATE_KEYS.map((templateKey) => ({
      templateKey,
      channel: offerChannel(templateKey, ctx.workspace.market),
      action: actions.find((a) => a.template_key === templateKey) ?? null,
    })),
  };
}

/** What the action page shows for an offer action (spec §5.4). */
export interface ActionOfferPanel {
  offerId: string | null;
  channel: OfferChannel;
  market: "hk" | "tw";
  endsOn: string | null;
  /** Per version: whether it may still be approved/first-exported, whether it was exported, and the facts it was written from. */
  versions: Record<string, { status: BindingStatus; exported: boolean; facts: OfferPromptFacts | null }>;
}

export async function actionOfferPanel(ctx: WorkspaceContext, detail: ActionDetail): Promise<ActionOfferPanel | null> {
  const templateKey = detail.action.templateKey;
  if (!isOfferTemplateKey(templateKey)) return null;
  const repo = offerRepository();
  const offerId = detail.action.offerId ?? null;
  const [offer, facts] = await Promise.all([
    offerId ? repo.get(ctx.workspace.id, offerId) : Promise.resolve<OfferRow | null>(null),
    repo.runOfferFacts(ctx.workspace.id, detail.action.id),
  ]);
  const factsByRevision = new Map(facts.map((f) => [f.revision, f.facts as OfferPromptFacts]));
  const day = today(ctx);
  return {
    offerId,
    channel: offerChannel(templateKey, ctx.workspace.market),
    market: ctx.workspace.market,
    endsOn: offer?.ends_on ?? null,
    versions: Object.fromEntries(
      detail.versions.map((version) => [
        version.id,
        {
          status: bindingStatus(version.offer ?? null, offer, day),
          exported: Boolean(version.first_exported_at),
          facts: version.offer ? factsByRevision.get(version.offer.revision) ?? null : null,
        },
      ]),
    ),
  };
}

