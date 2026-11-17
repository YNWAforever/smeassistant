import "server-only";
import type { Pool } from "pg";

import { getPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";

/**
 * Instagram (Meta Graph) connection storage on the shared `oauth_connections`
 * table. The provider value `'instagram'` was reserved in the original
 * migration and is now used; nothing else about the table changes.
 *
 * `account_ref` holds the resolved professional account as JSON
 * `{"id":"<ig user id>","username":"<handle>"}`: publishing and insights need
 * the numeric id, the owner needs the username, and the column is free text
 * with no other reader. `parseInstagramAccountRef` is the single parser.
 */
export interface InstagramConnectionRow {
  id: string;
  status: "active" | "expired" | "revoked" | "error";
  scopes: string[];
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  expiresAt: string | null;
  accountRef: string | null;
  updatedAt: string | null;
}

export interface InstagramConnectionInput {
  workspaceId: string;
  accountRef: string;
  accessTokenEncrypted: string;
  scopes: string[];
  expiresAt: string | null;
}

export interface InstagramAccountRef {
  id: string;
  username: string;
}

/** Parses the `account_ref` JSON written by the connection route. */
export function parseInstagramAccountRef(value: string | null | undefined): InstagramAccountRef | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { id?: unknown; username?: unknown };
    if (typeof parsed?.id === "string" && parsed.id && typeof parsed.username === "string" && parsed.username) {
      return { id: parsed.id, username: parsed.username };
    }
    return null;
  } catch {
    return null;
  }
}

export function instagramConnectionRepository(pool?: Pick<Pool, "query" | "connect">) {
  const database = () => pool ?? getPool();
  return {
    async connection(workspaceId: string): Promise<InstagramConnectionRow | null> {
      const result = await database().query<InstagramConnectionRow>(
        `SELECT id, status, scopes, access_token_encrypted AS "accessTokenEncrypted",
                refresh_token_encrypted AS "refreshTokenEncrypted", expires_at::text AS "expiresAt",
                account_ref AS "accountRef", updated_at::text AS "updatedAt"
           FROM oauth_connections
          WHERE workspace_id=$1 AND provider='instagram'
          ORDER BY (status='active') DESC, updated_at DESC, id DESC
          LIMIT 1`,
        [workspaceId],
      );
      return result.rows[0] ?? null;
    },

    /**
     * Installs a new consent as the workspace's active Instagram connection.
     * A previous active or expired row is revoked first; the partial unique
     * index allows exactly one active row per provider.
     */
    async replaceConnection(input: InstagramConnectionInput): Promise<string> {
      return withTransaction(async (db) => {
        await db.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [input.workspaceId]);
        await db.query(
          `UPDATE oauth_connections
              SET status='revoked', access_token_encrypted='', refresh_token_encrypted=NULL, updated_at=now()
            WHERE workspace_id=$1 AND provider='instagram' AND status IN ('active','expired','error')`,
          [input.workspaceId],
        );
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO oauth_connections(workspace_id, provider, account_ref, access_token_encrypted, refresh_token_encrypted, scopes, expires_at)
           VALUES($1, 'instagram', $2, $3, NULL, $4, $5)
           RETURNING id`,
          [input.workspaceId, input.accountRef, input.accessTokenEncrypted, input.scopes, input.expiresAt],
        );
        return inserted.rows[0].id;
      }, database());
    },

    /** Replaces the stored long-lived token after a successful refresh. */
    async refreshConnection(input: { workspaceId: string; id: string; accessTokenEncrypted: string; expiresAt: string | null }): Promise<boolean> {
      const updated = await database().query(
        `UPDATE oauth_connections
            SET access_token_encrypted=$3, expires_at=$4, updated_at=now()
          WHERE workspace_id=$1 AND id=$2 AND provider='instagram' AND status='active'
          RETURNING id`,
        [input.workspaceId, input.id, input.accessTokenEncrypted, input.expiresAt],
      );
      return updated.rows.length > 0;
    },

    /** Marks the connection unusable so the page asks for a reconnect. */
    async expireConnection(workspaceId: string, id: string): Promise<void> {
      await database().query(
        `UPDATE oauth_connections
            SET status='expired', updated_at=now()
          WHERE workspace_id=$1 AND id=$2 AND provider='instagram' AND status='active'`,
        [workspaceId, id],
      );
    },

    /**
     * Withdraws whatever credential the workspace holds. Returns false when
     * there was nothing active to withdraw, which the route reports as a
     * success (the requested end state already holds).
     */
    async disconnect(workspaceId: string): Promise<boolean> {
      return withTransaction(async (db) => {
        await db.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [workspaceId]);
        const revoked = await db.query<{ id: string }>(
          `UPDATE oauth_connections
              SET status='revoked', access_token_encrypted='', refresh_token_encrypted=NULL, updated_at=now()
            WHERE workspace_id=$1 AND provider='instagram' AND status IN ('active','expired','error')
            RETURNING id`,
          [workspaceId],
        );
        return revoked.rows.length > 0;
      }, database());
    },
  };
}
