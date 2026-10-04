import "server-only";
import type { Pool, PoolClient } from "pg";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { filterSelectedReviews, sampledReviewsFromRawData } from "../workspace/evidence-inputs";
import { artifactRepository } from "./artifacts";

/**
 * Google Business Profile review-reply publishing on plain `pg`
 * (neon/migrations/0014_publish_reply.sql, spec §1, §2.4).
 *
 * `begin_publish_output_version`, `finish_publish_output_version` and
 * `cancel_published_reply` own every state transition, the allowance check
 * and the once-per-version counting (DEC-14); this module only names the
 * arguments, maps the jsonb results and maps the raised P0001 `message` to a
 * PublishError. A unique violation on one of the two partial indexes (two
 * begins racing past the functions' own checks) maps to the code the check
 * would have raised. Any other database error is rethrown unchanged.
 *
 * `publishDeliveryIds`, `publishSubject`, `candidateReviewTexts` and the first
 * query of `getDelivery` read only columns that exist before 0014, so all are
 * safe on a database without it. So are
 * the three `oauth_connections` methods (spec §2.3): that table is unchanged
 * by 0014. They move sealed ciphertext only; `lib/publishing/connection.ts`
 * is the one place that unseals it.
 */
type Executor = Pick<Pool | PoolClient, "query">;

export type PublishErrorCode =
  | "version_not_found"
  | "not_approved"
  | "already_publishing"
  | "target_busy"
  | "allowance_exceeded"
  | "delivery_not_publishing"
  | "delivery_not_published"
  | "invalid_outcome"
  | "offer_not_found"
  | "offer_inactive"
  | "offer_changed"
  | "offer_expired";

const PUBLISH_ERROR_CODES: ReadonlySet<string> = new Set<PublishErrorCode>([
  "version_not_found",
  "not_approved",
  "already_publishing",
  "target_busy",
  "allowance_exceeded",
  "delivery_not_publishing",
  "delivery_not_published",
  "invalid_outcome",
  "offer_not_found",
  "offer_inactive",
  "offer_changed",
  "offer_expired",
]);

export class PublishError extends Error {
  /**
   * `deliveryId` is the active publish's id for `already_publishing` (the SQL
   * error detail), and null otherwise.
   */
  constructor(
    readonly code: PublishErrorCode,
    readonly deliveryId: string | null = null,
  ) {
    super(code);
    this.name = "PublishError";
  }
}

/**
 * The only values `finish` stores as `failure_reason` (spec §3.2, §3.3, §5): a
 * code, so provider text can never be stored by accident.
 */
export type PublishFailureReason =
  | "already_replied"
  | "connection_expired"
  | "provider_forbidden"
  | "review_not_found"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "not_applied";

export type PublishSubject = {
  workspaceId: string;
  actionId: string;
  locationId: string | null;
  placeId: string | null;
  templateKey: string;
  versionNo: number;
  approvalState: string;
  body: string;
};

export type PublishState = "publishing" | "published" | "failed" | "cancelled";

const PUBLISH_STATES: ReadonlySet<string> = new Set<PublishState>(["publishing", "published", "failed", "cancelled"]);

export type PublishDelivery = {
  id: string;
  workspaceId: string;
  versionId: string;
  actionId: string;
  locationId: string | null;
  templateKey: string;
  versionNo: number;
  body: string;
  state: PublishState;
  targetRef: string;
  counted: boolean;
  failureReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

export type GbpConnectionRow = {
  id: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  scopes: string[];
  expiresAt: string | null;
};

export type PublishReceipt = { review_name: string; reply_update_time: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The partial unique indexes 0014 adds as the race backstop, and the code each stands for. */
const RACE_CONSTRAINTS: ReadonlyMap<string, PublishErrorCode> = new Map([
  ["deliveries_active_publish_version_key", "already_publishing"],
  ["deliveries_active_publish_target_key", "target_busy"],
]);

/**
 * Map a P0001 raised by the publish functions (or the offer guard), or a 23505
 * on one of the race-backstop indexes, to a PublishError; rethrow anything
 * else unchanged. A raced `already_publishing` carries no delivery id: the
 * violation names the version, not the winning delivery.
 */
async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const pg = error as { code?: unknown; message?: unknown; detail?: unknown; constraint?: unknown } | null;
    if (pg && pg.code === "23505" && typeof pg.constraint === "string") {
      const raced = RACE_CONSTRAINTS.get(pg.constraint);
      if (raced) throw new PublishError(raced);
    }
    if (pg && pg.code === "P0001" && typeof pg.message === "string" && PUBLISH_ERROR_CODES.has(pg.message)) {
      const code = pg.message as PublishErrorCode;
      const deliveryId = code === "already_publishing" && typeof pg.detail === "string" && UUID.test(pg.detail) ? pg.detail : null;
      throw new PublishError(code, deliveryId);
    }
    throw error;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error("unexpected_publish_result");
}

function publishState(value: unknown): PublishState {
  if (typeof value === "string" && PUBLISH_STATES.has(value)) return value as PublishState;
  throw new Error("unexpected_publish_result");
}

const iso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

export function publishingRepository(client?: Executor) {
  const db = () => client ?? getPool();

  /**
   * Runs `work` in a transaction. Omitted, or given a pool, this opens its own;
   * given a checked-out client (or a bare executor), the caller owns
   * BEGIN/COMMIT and `work` runs on that client.
   */
  function inTransaction<T>(work: (tx: Executor) => Promise<T>): Promise<T> {
    if (!client) return withTransaction(work);
    const candidate = client as Partial<Pool & PoolClient>;
    if (typeof candidate.connect === "function" && typeof candidate.release !== "function") {
      return withTransaction(work, candidate as Pick<Pool, "connect">);
    }
    return work(client);
  }

  async function fn(sql: string, values: unknown[]): Promise<Record<string, unknown>> {
    const row = (await db().query<{ result: unknown }>(sql, values)).rows[0];
    return record(row?.result);
  }

  return {
    async begin(input: {
      versionId: string;
      actorId: string;
      targetRef: string;
      idempotencyKey: string;
    }): Promise<{ kind: "begun" | "existing"; deliveryId: string; state: PublishState }> {
      const result = await call(() =>
        fn("SELECT public.begin_publish_output_version($1::uuid, $2::uuid, $3::text, $4::text) AS result", [
          input.versionId,
          input.actorId,
          input.targetRef,
          input.idempotencyKey,
        ]),
      );
      if ((result.kind !== "begun" && result.kind !== "existing") || typeof result.delivery_id !== "string") {
        throw new Error("unexpected_publish_result");
      }
      return { kind: result.kind, deliveryId: result.delivery_id, state: publishState(result.state) };
    },

    async finish(input: {
      deliveryId: string;
      actorId: string;
      outcome: "published" | "failed";
      receipt: PublishReceipt | null;
      reason: PublishFailureReason | null;
    }): Promise<{ kind: "finished" | "existing"; state: PublishState; counted: boolean }> {
      const result = await call(() =>
        fn("SELECT public.finish_publish_output_version($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::text) AS result", [
          input.deliveryId,
          input.actorId,
          input.outcome,
          input.receipt === null ? null : JSON.stringify(input.receipt),
          input.reason,
        ]),
      );
      if ((result.kind !== "finished" && result.kind !== "existing") || typeof result.counted !== "boolean") {
        throw new Error("unexpected_publish_result");
      }
      return { kind: result.kind, state: publishState(result.state), counted: result.counted };
    },

    async cancel(input: { deliveryId: string; actorId: string }): Promise<{ state: "cancelled" }> {
      const result = await call(() =>
        fn("SELECT public.cancel_published_reply($1::uuid, $2::uuid) AS result", [input.deliveryId, input.actorId]),
      );
      if (result.state !== "cancelled") throw new Error("unexpected_publish_result");
      return { state: "cancelled" };
    },

    /** The workspace's one `active` Google Business Profile row, sealed tokens as stored. */
    async activeGbpConnection(workspaceId: string): Promise<GbpConnectionRow | null> {
      const row = (
        await db().query<{
          id: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string | null;
          scopes: string[] | null;
          expires_at: Date | string | null;
        }>(
          `SELECT id, access_token_encrypted, refresh_token_encrypted, scopes, expires_at
             FROM oauth_connections
            WHERE workspace_id = $1 AND provider = 'google_gbp' AND status = 'active'
            LIMIT 1`,
          [workspaceId],
        )
      ).rows[0];
      if (!row) return null;
      return {
        id: row.id,
        accessTokenEncrypted: row.access_token_encrypted,
        refreshTokenEncrypted: row.refresh_token_encrypted,
        scopes: row.scopes ?? [],
        expiresAt: row.expires_at === null ? null : iso(row.expires_at),
      };
    },

    /**
     * Stores a refreshed, already-sealed access token. Takes the workspace lock
     * `replaceGoogleConnection` and `disconnectGoogleConnection` take, so a
     * refresh racing a reconnect or disconnect serialises; the `status='active'`
     * guard then makes a refresh of a since-replaced row a no-op. The stored
     * refresh token is never rotated here.
     */
    async storeRefreshedToken(input: {
      connectionId: string;
      workspaceId: string;
      accessTokenEncrypted: string;
      expiresAt: string | null;
    }): Promise<void> {
      await inTransaction(async (tx) => {
        await tx.query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE", [input.workspaceId]);
        await tx.query(
          `UPDATE oauth_connections
              SET access_token_encrypted = $3, expires_at = $4, updated_at = now()
            WHERE workspace_id = $1 AND id = $2 AND status = 'active'`,
          [input.workspaceId, input.connectionId, input.accessTokenEncrypted, input.expiresAt],
        );
      });
    },

    /** Only an `active` row moves to `expired`; a revoked or replaced row is left as it is. */
    async markConnectionExpired(connectionId: string): Promise<void> {
      await db().query(
        "UPDATE oauth_connections SET status = 'expired', updated_at = now() WHERE id = $1 AND status = 'active'",
        [connectionId],
      );
    },

    /** Pre-0014-safe: only id, version_id, state and created_at, all from 0002. */
    async publishDeliveryIds(
      workspaceId: string,
      versionIds: string[],
    ): Promise<Array<{ id: string; versionId: string; state: string; createdAt: string }>> {
      if (versionIds.length === 0) return [];
      const rows = (
        await db().query<{ id: string; version_id: string; state: string; created_at: Date }>(
          `SELECT id, version_id, state, created_at FROM deliveries
            WHERE workspace_id = $1 AND version_id = ANY($2::uuid[]) AND mode = 'publish'
            ORDER BY created_at, id`,
          [workspaceId, versionIds],
        )
      ).rows;
      return rows.map((row) => ({ id: row.id, versionId: row.version_id, state: row.state, createdAt: iso(row.created_at) }));
    },

    /**
     * Pre-0014-safe: the existence check reads only 0002 columns, so a database
     * without 0014 (which has no publish deliveries) answers null before any
     * 0014 column is named.
     *
     * Not workspace-scoped: it finds the delivery by id alone. Callers must
     * check the id against `UUID_RE` first, and must authorize the session
     * against the returned `workspaceId` and `locationId` before using or
     * returning anything from it.
     */
    async getDelivery(deliveryId: string): Promise<PublishDelivery | null> {
      const exists = (
        await db().query<{ id: string }>("SELECT id FROM deliveries WHERE id = $1 AND mode = 'publish'", [deliveryId])
      ).rows[0];
      if (!exists) return null;
      const row = (
        await db().query<{
          id: string;
          workspace_id: string;
          version_id: string;
          action_id: string;
          location_id: string | null;
          template_key: string;
          version_no: number;
          body: string;
          state: string;
          target_ref: string;
          counted: boolean;
          failure_reason: string | null;
          verified_at: Date | null;
          created_at: Date;
        }>(
          `SELECT d.id, d.workspace_id, d.version_id, v.action_id, a.location_id, a.template_key, v.version_no, v.body,
                  d.state, d.target_ref, d.counted, d.failure_reason, d.verified_at, d.created_at
             FROM deliveries d
             JOIN output_versions v ON v.id = d.version_id
             JOIN actions a ON a.id = v.action_id
            WHERE d.id = $1 AND d.mode = 'publish'`,
          [deliveryId],
        )
      ).rows[0];
      if (!row) return null;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        versionId: row.version_id,
        actionId: row.action_id,
        locationId: row.location_id,
        templateKey: row.template_key,
        versionNo: row.version_no,
        body: row.body,
        state: publishState(row.state),
        targetRef: row.target_ref,
        counted: row.counted,
        failureReason: row.failure_reason,
        verifiedAt: row.verified_at === null ? null : iso(row.verified_at),
        createdAt: iso(row.created_at),
      };
    },

    /**
     * What the publish routes need about one version before any check: its
     * workspace and action, the action's location and that location's place,
     * the template, the version number, the approval state and the body.
     * Pre-0014-safe: every column is from 0002. Null for an unknown version,
     * or one whose action belongs to another workspace.
     */
    async publishSubject(versionId: string): Promise<PublishSubject | null> {
      const row = (
        await db().query<{
          workspace_id: string;
          action_id: string;
          location_id: string | null;
          place_id: string | null;
          template_key: string;
          version_no: number;
          approval_state: string;
          body: string;
        }>(
          `SELECT a.workspace_id, v.action_id, a.location_id, l.place_id, a.template_key, v.version_no, v.approval_state, v.body
             FROM output_versions v
             JOIN actions a ON a.id = v.action_id AND a.workspace_id = v.workspace_id
             LEFT JOIN locations l ON l.id = a.location_id AND l.workspace_id = a.workspace_id
            WHERE v.id = $1`,
          [versionId],
        )
      ).rows[0];
      if (!row) return null;
      return {
        workspaceId: row.workspace_id,
        actionId: row.action_id,
        locationId: row.location_id,
        placeId: row.place_id,
        templateKey: row.template_key,
        versionNo: row.version_no,
        approvalState: row.approval_state,
        body: row.body,
      };
    },

    /**
     * The sampled review texts the version's action was drafted from, for the
     * target preselection (spec §3.1): the action's evidence snapshot → its
     * job → `raw_data` (read by the assistant's own query), narrowed to the
     * owner's `selected_reviews`. Only a hint, so any failure is `[]`.
     * Pre-0014-safe.
     */
    async candidateReviewTexts(versionId: string): Promise<string[]> {
      try {
        const row = (
          await db().query<{ workspace_id: string; job_id: string; provided_inputs: unknown }>(
            `SELECT a.workspace_id, s.job_id, a.provided_inputs
               FROM output_versions v
               JOIN actions a ON a.id = v.action_id AND a.workspace_id = v.workspace_id
               JOIN scan_snapshots s ON s.id = a.source_snapshot_id AND s.workspace_id = a.workspace_id
              WHERE v.id = $1`,
            [versionId],
          )
        ).rows[0];
        if (!row) return [];
        const raw = await artifactRepository(client).assistantReviewData(row.workspace_id, row.job_id);
        const provided =
          row.provided_inputs && typeof row.provided_inputs === "object" && !Array.isArray(row.provided_inputs)
            ? (row.provided_inputs as Record<string, unknown>)
            : {};
        return filterSelectedReviews(sampledReviewsFromRawData(raw), provided.selected_reviews).map((review) => review.text);
      } catch {
        return [];
      }
    },
  };
}

export type PublishingRepository = ReturnType<typeof publishingRepository>;
