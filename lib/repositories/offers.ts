import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import { OfferError, type Offer, type OfferCurrency, type OfferErrorCode, type OfferInput, type OfferStatus } from "../workspace/offers";

/**
 * Offers on plain `pg` (neon/migrations/0011_offers.sql). Confirmation and
 * archiving go through the SQL functions, which own the state machine and their
 * audit rows; this module only names the arguments and maps the raised
 * `message` to an OfferError. `numeric` comes back as a string, so
 * price_amount is converted here; dates are read as YYYY-MM-DD text.
 * `expired` is always `public.offer_is_expired(...)` evaluated in the same
 * query, so the database clock and the workspace timezone are the only clock.
 */
interface OfferRow {
  id: string;
  workspace_id: string;
  location_id: string | null;
  title: string;
  details: string;
  terms: string;
  price_amount: string | null;
  currency: OfferCurrency | null;
  valid_from: string;
  valid_until: string;
  claims: string[];
  prohibited_terms: string[];
  asset_id: string | null;
  status: OfferStatus;
  revision: number;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  expired: boolean;
}

const KNOWN_CODES: OfferErrorCode[] = [
  "offer_not_found",
  "offer_archived",
  "offer_revision_changed",
  "offer_incomplete",
  "offer_currency_market",
  "offer_expired",
];

function columns(alias: string): string {
  const a = alias ? `${alias}.` : "";
  return `${a}id, ${a}workspace_id, ${a}location_id, ${a}title, ${a}details, ${a}terms, ${a}price_amount::text AS price_amount, ${a}currency,
    ${a}valid_from::text AS valid_from, ${a}valid_until::text AS valid_until, ${a}claims, ${a}prohibited_terms, ${a}asset_id, ${a}status,
    ${a}revision, ${a}confirmed_at, ${a}created_at, ${a}updated_at, public.offer_is_expired(${a}valid_until, ${a}workspace_id) AS expired`;
}

function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    locationId: row.location_id,
    title: row.title,
    details: row.details,
    terms: row.terms,
    priceAmount: row.price_amount === null ? null : Number(row.price_amount),
    currency: row.currency,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    claims: row.claims,
    prohibitedTerms: row.prohibited_terms,
    assetId: row.asset_id,
    status: row.status,
    revision: row.revision,
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
    expired: row.expired,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function call<T>(fn: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = KNOWN_CODES.find((known) => message === known);
    if (code) throw new OfferError(code);
    throw new Error(`${fn} failed`);
  }
}

/** The input fields in a fixed order, as the values a comparison and an INSERT/UPDATE both use. */
function inputValues(input: OfferInput): unknown[] {
  return [
    input.location_id,
    input.title,
    input.details,
    input.terms,
    input.price_amount,
    input.currency,
    input.valid_from,
    input.valid_until,
    input.claims,
    input.prohibited_terms,
    input.asset_id,
  ];
}

type UpdateOutcome = { kind: "updated"; offer: Offer; changed: string[] } | { kind: "revision_changed" | "archived" | "not_found" };

export function offerRepository(client?: Pick<Pool, "query">) {
  const db = () => client ?? getPool();
  return {
    async list(workspaceId: string): Promise<Offer[]> {
      const { rows } = await db().query<OfferRow>(
        `SELECT ${columns("")} FROM offers WHERE workspace_id=$1 ORDER BY created_at DESC, id DESC`,
        [workspaceId],
      );
      return rows.map(toOffer);
    },

    async get(workspaceId: string, offerId: string): Promise<Offer | null> {
      const { rows } = await db().query<OfferRow>(`SELECT ${columns("")} FROM offers WHERE workspace_id=$1 AND id=$2`, [workspaceId, offerId]);
      return rows[0] ? toOffer(rows[0]) : null;
    },

    async create(workspaceId: string, actorId: string, input: OfferInput): Promise<Offer> {
      const { rows } = await db().query<OfferRow>(
        `INSERT INTO offers(workspace_id,created_by,location_id,title,details,terms,price_amount,currency,valid_from,valid_until,claims,prohibited_terms,asset_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${columns("")}`,
        [workspaceId, actorId, ...inputValues(input)],
      );
      return toOffer(rows[0]);
    },

    /**
     * One UPDATE guarded on revision and not-archived. The pre-update values ride
     * back from the same statement (`old` is read in the same snapshot), so
     * `changed` can never be computed against a row another request already
     * moved. A fact edit resets the offer to draft and clears the confirmation.
     */
    async update(workspaceId: string, offerId: string, expectedRevision: number, input: OfferInput): Promise<UpdateOutcome> {
      const { rows } = await db().query<OfferRow & { old: Record<string, unknown> }>(
        `UPDATE offers o SET location_id=$4, title=$5, details=$6, terms=$7, price_amount=$8, currency=$9, valid_from=$10, valid_until=$11,
                claims=$12, prohibited_terms=$13, asset_id=$14, revision=o.revision+1, status='draft', confirmed_at=NULL, confirmed_by=NULL, updated_at=now()
           FROM (SELECT id, location_id, title, details, terms, price_amount::text AS price_amount, currency, valid_from::text AS valid_from,
                        valid_until::text AS valid_until, claims, prohibited_terms, asset_id
                   FROM offers WHERE workspace_id=$1 AND id=$2) old
          WHERE o.workspace_id=$1 AND o.id=$2 AND old.id=o.id AND o.revision=$3 AND o.status <> 'archived'
          RETURNING ${columns("o")}, to_jsonb(old) AS old`,
        [workspaceId, offerId, expectedRevision, ...inputValues(input)],
      );
      if (rows[0]) {
        const { old, ...row } = rows[0];
        return { kind: "updated", offer: toOffer(row), changed: changedFields(old, input) };
      }
      const status = (await db().query<{ status: OfferStatus }>(`SELECT status FROM offers WHERE workspace_id=$1 AND id=$2`, [workspaceId, offerId])).rows[0]
        ?.status;
      if (!status) return { kind: "not_found" };
      return { kind: status === "archived" ? "archived" : "revision_changed" };
    },

    async confirm(offerId: string, actorId: string, expectedRevision: number): Promise<{ kind: "confirmed" | "already-confirmed"; revision: number }> {
      return call("confirm_offer", async () => {
        const result = (await db().query<{ r: { kind: "confirmed" | "already-confirmed"; revision: number } }>("SELECT public.confirm_offer($1,$2,$3) AS r", [
          offerId,
          actorId,
          expectedRevision,
        ])).rows[0].r;
        return { kind: result.kind, revision: result.revision };
      });
    },

    async archive(offerId: string, actorId: string): Promise<{ kind: "archived" | "already-archived"; cancelledActions: number }> {
      return call("archive_offer", async () => {
        const result = (await db().query<{ r: { kind: "archived" | "already-archived"; cancelled_actions: number } }>("SELECT public.archive_offer($1,$2) AS r", [
          offerId,
          actorId,
        ])).rows[0].r;
        return { kind: result.kind, cancelledActions: result.cancelled_actions };
      });
    },
  };
}

export type OfferRepository = ReturnType<typeof offerRepository>;

const CHANGE_KEYS = [
  "location_id",
  "title",
  "details",
  "terms",
  "price_amount",
  "currency",
  "valid_from",
  "valid_until",
  "claims",
  "prohibited_terms",
  "asset_id",
] as const;

/** Compares by value: `numeric` text "1280.00" equals the number 1280; lists compare in order. */
function changedFields(old: Record<string, unknown>, input: OfferInput): string[] {
  const next = input as unknown as Record<string, unknown>;
  return CHANGE_KEYS.filter((key) => {
    const before = old[key];
    const after = next[key];
    if (key === "price_amount") return (before === null ? null : Number(before)) !== (after ?? null);
    if (key === "claims" || key === "prohibited_terms") return JSON.stringify(before) !== JSON.stringify(after);
    return (before ?? null) !== (after ?? null);
  });
}
