import "server-only";
import type { Pool, PoolClient } from "pg";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";

/**
 * Google Business Profile review-reply publishing on plain `pg`
 * (neon/migrations/0014_publish_reply.sql, spec §1, §2.4).
 *
 * `begin_publish_output_version`, `finish_publish_output_version` and
 * `cancel_published_reply` own every state transition, the allowance check
 * and the once-per-version counting (DEC-14); this module only names the
 * arguments, maps the jsonb results and maps the raised P0001 `message` to a
 * PublishError. Any other database error is rethrown unchanged.
 *
 * `publishDeliveryIds` and the first query of `getDelivery` read only columns
 * that exist before 0014, so both are safe on a database without it. So are
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

/** Map a P0001 raised by the publish functions (or the offer guard) to a PublishError; rethrow anything else unchanged. */
async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const pg = error as { code?: unknown; message?: unknown; detail?: unknown } | null;
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
      reason: string | null;
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
  };
}

export type PublishingRepository = ReturnType<typeof publishingRepository>;
