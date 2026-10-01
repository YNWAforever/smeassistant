import { clientRequest, type ClientResult } from "@/lib/workspace/client";
import type { OfferView } from "./view";
import type { OfferTemplateKey } from "./workflow";

/**
 * Browser helpers for the offer routes (spec §6). Like lib/workspace/client.ts,
 * each returns a discriminated result and never throws.
 */
const JSON_HEADERS = { "Content-Type": "application/json" };

export interface OfferFormBody {
  title: string;
  details: string;
  terms: string | null;
  price_amount: string | null;
  starts_on: string;
  ends_on: string | null;
  open_ended: boolean;
  approved_claims: string[];
  prohibited_wording: string[];
  asset_ids: string[];
  location_id: string | null;
}

const base = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}/offers`;
const send = <T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<ClientResult<T>> =>
  clientRequest<T>(url, { method, headers: JSON_HEADERS, body: JSON.stringify(body) });

export function createOffer(workspaceId: string, body: OfferFormBody, locale: string): Promise<ClientResult<{ offer: OfferView }>> {
  return send(base(workspaceId), "POST", { ...body, locale });
}

export function updateOffer(workspaceId: string, offerId: string, expectedRevision: number, body: OfferFormBody, locale: string): Promise<ClientResult<{ offer: OfferView }>> {
  return send(`${base(workspaceId)}/${encodeURIComponent(offerId)}`, "PATCH", { ...body, expected_revision: expectedRevision, locale });
}

export function archiveOffer(workspaceId: string, offerId: string, locale: string): Promise<ClientResult<{ offer: OfferView }>> {
  return send(`${base(workspaceId)}/${encodeURIComponent(offerId)}`, "PATCH", { archive: true, locale });
}

export function confirmOffer(workspaceId: string, offerId: string, expectedRevision: number, locale: string): Promise<ClientResult<{ offer: OfferView }>> {
  return send(`${base(workspaceId)}/${encodeURIComponent(offerId)}/confirm`, "POST", { expected_revision: expectedRevision, locale });
}

export function prepareDrafts(workspaceId: string, offerId: string, templateKeys: OfferTemplateKey[], locale: string): Promise<ClientResult<{ actions: Array<{ templateKey: OfferTemplateKey; actionId: string; created: boolean }> }>> {
  return send(`${base(workspaceId)}/${encodeURIComponent(offerId)}/drafts`, "POST", { template_keys: templateKeys, locale });
}
