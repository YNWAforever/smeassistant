import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import type { OfferInput, OfferRow } from "../offers/types";

/** Every offer read returns dates and timestamps as text, as workspace-read.ts does. */
export const OFFER_COLUMNS =
  "id,workspace_id,location_id,title,details,terms,price_amount::text,currency,starts_on::text,ends_on::text,open_ended,approved_claims,prohibited_wording,asset_ids::text[],source,status,revision,confirmed_by,confirmed_at::text,created_by,created_at::text,updated_at::text,archived_at::text";

export interface OfferRepository {
  list(workspaceId: string, opts?: { locationIds?: readonly string[] | null }): Promise<OfferRow[]>;
  get(workspaceId: string, id: string): Promise<OfferRow | null>;
  /** Null when the location is not one of the workspace's. */
  create(input: OfferInput & { workspaceId: string; createdBy: string }): Promise<OfferRow | null>;
  update(workspaceId: string, id: string, expectedRevision: number, patch: OfferInput): Promise<OfferRow | "conflict" | "archived" | "location_invalid" | null>;
  confirm(workspaceId: string, id: string, expectedRevision: number, actorId: string): Promise<OfferRow | "conflict" | null>;
  archive(workspaceId: string, id: string): Promise<OfferRow | null>;
  /** Open draft actions per offer, for the list page. */
  draftCounts(workspaceId: string): Promise<Map<string, number>>;
  /** Open offer actions with their latest run and version state, for the offer page. */
  offerActions(workspaceId: string, offerId: string): Promise<OfferActionRow[]>;
  /** The offer facts each run of an action was given, by offer revision (runs.ts records them). */
  runOfferFacts(workspaceId: string, actionId: string): Promise<Array<{ revision: number; facts: unknown }>>;
}

export interface OfferActionRow {
  id: string;
  template_key: string;
  action_state: string;
  run_state: string | null;
  latest_version_id: string | null;
  approval_state: string | null;
  delivery_state: string | null;
}

export function offerRepository(client?: Pick<Pool, "query">): OfferRepository {
  const db = () => client ?? getPool();
  return {
    async list(workspaceId, opts = {}) {
      const scoped = opts.locationIds ?? null;
      return (await db().query<OfferRow>(
        `SELECT ${OFFER_COLUMNS} FROM offers WHERE workspace_id=$1 AND ($2::uuid[] IS NULL OR location_id IS NULL OR location_id = ANY($2::uuid[])) ORDER BY starts_on DESC, created_at DESC`,
        [workspaceId, scoped],
      )).rows;
    },
    async get(workspaceId, id) {
      return (await db().query<OfferRow>(`SELECT ${OFFER_COLUMNS} FROM offers WHERE workspace_id=$1 AND id=$2`, [workspaceId, id])).rows[0] ?? null;
    },
    async create(input) {
      return (await db().query<OfferRow>(
        `INSERT INTO offers(workspace_id,location_id,title,details,terms,price_amount,currency,starts_on,ends_on,open_ended,approved_claims,prohibited_wording,asset_ids,created_by)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
         WHERE $2::uuid IS NULL OR EXISTS(SELECT 1 FROM locations WHERE id=$2 AND workspace_id=$1)
         RETURNING ${OFFER_COLUMNS}`,
        [input.workspaceId, input.location_id, input.title, input.details, input.terms, input.price_amount, input.currency, input.starts_on, input.ends_on, input.open_ended, input.approved_claims, input.prohibited_wording, input.asset_ids, input.createdBy],
      )).rows[0] ?? null;
    },
    async update(workspaceId, id, expectedRevision, patch) {
      // One statement: a stale revision or an archived offer changes nothing,
      // and every fact edit returns the offer to draft at the next revision.
      const result = await db().query<OfferRow>(
        `UPDATE offers SET location_id=$4,title=$5,details=$6,terms=$7,price_amount=$8,currency=$9,starts_on=$10,ends_on=$11,open_ended=$12,
           approved_claims=$13,prohibited_wording=$14,asset_ids=$15,revision=revision+1,status='draft',confirmed_by=NULL,confirmed_at=NULL,updated_at=now()
         WHERE workspace_id=$1 AND id=$2 AND revision=$3 AND status<>'archived'
           AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM locations WHERE id=$4 AND workspace_id=$1))
         RETURNING ${OFFER_COLUMNS}`,
        [workspaceId, id, expectedRevision, patch.location_id, patch.title, patch.details, patch.terms, patch.price_amount, patch.currency, patch.starts_on, patch.ends_on, patch.open_ended, patch.approved_claims, patch.prohibited_wording, patch.asset_ids],
      );
      if (result.rows[0]) return result.rows[0];
      const current = await this.get(workspaceId, id);
      if (!current) return null;
      if (current.status === "archived") return "archived";
      if (current.revision !== expectedRevision) return "conflict";
      return "location_invalid";
    },
    async confirm(workspaceId, id, expectedRevision, actorId) {
      const result = await db().query<OfferRow>(
        `UPDATE offers SET status='confirmed',confirmed_by=$4,confirmed_at=now(),updated_at=now()
         WHERE workspace_id=$1 AND id=$2 AND revision=$3 AND status='draft' RETURNING ${OFFER_COLUMNS}`,
        [workspaceId, id, expectedRevision, actorId],
      );
      if (result.rows[0]) return result.rows[0];
      const current = await this.get(workspaceId, id);
      return current ? "conflict" : null;
    },
    async archive(workspaceId, id) {
      return (await db().query<OfferRow>(
        `UPDATE offers SET status='archived',archived_at=coalesce(archived_at,now()),updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING ${OFFER_COLUMNS}`,
        [workspaceId, id],
      )).rows[0] ?? null;
    },
    async draftCounts(workspaceId) {
      const rows = (await db().query<{ offer_id: string; n: number }>(
        `SELECT offer_id,count(*)::int AS n FROM actions WHERE workspace_id=$1 AND offer_id IS NOT NULL AND action_state NOT IN ('completed','dismissed','cancelled','expired') GROUP BY offer_id`,
        [workspaceId],
      )).rows;
      return new Map(rows.map((row) => [row.offer_id, row.n]));
    },
    async offerActions(workspaceId, offerId) {
      return (await db().query<OfferActionRow>(
        `SELECT a.id,a.template_key,a.action_state,
           (SELECT r.state FROM action_runs r WHERE r.action_id=a.id ORDER BY r.created_at DESC LIMIT 1) AS run_state,
           v.id AS latest_version_id,v.approval_state,v.delivery_state
         FROM actions a
         LEFT JOIN LATERAL (SELECT id,approval_state,delivery_state FROM output_versions WHERE action_id=a.id ORDER BY version_no DESC LIMIT 1) v ON true
         WHERE a.workspace_id=$1 AND a.offer_id=$2 AND a.action_state NOT IN ('completed','dismissed','cancelled','expired')
         ORDER BY a.created_at`,
        [workspaceId, offerId],
      )).rows;
    },
    async runOfferFacts(workspaceId, actionId) {
      return (await db().query<{ revision: number; facts: unknown }>(
        `SELECT DISTINCT ON ((input->'offer'->>'revision')::int) (input->'offer'->>'revision')::int AS revision,input->'offer'->'facts' AS facts
         FROM action_runs WHERE workspace_id=$1 AND action_id=$2 AND input->'offer'->'facts' IS NOT NULL
         ORDER BY (input->'offer'->>'revision')::int, created_at DESC`,
        [workspaceId, actionId],
      )).rows;
    },
  };
}
