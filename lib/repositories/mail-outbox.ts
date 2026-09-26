import "server-only";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../db/transaction";
import { LEASE_MINUTES, type HoldReason, type MailKind, type RecipientFacts } from "../mail/decide";

type Executor = Pick<Pool | PoolClient, "query">;
type Locale = "en" | "zh-HK" | "zh-TW";

/** Only `Pool` lacks `.release` -- a `PoolClient` (from `pool.connect()` or `withTransaction`) always has one. */
function isPoolClient(client: Pool | PoolClient): client is PoolClient {
  return typeof (client as PoolClient).release === "function";
}

function notifyColumn(kind: MailKind): "notify_rescan_complete" | "notify_regression_alert" {
  return kind === "rescan_complete" ? "notify_rescan_complete" : "notify_regression_alert";
}

function memberColumn(kind: MailKind): "mail_rescan_complete" | "mail_regression_alert" {
  return kind === "rescan_complete" ? "mail_rescan_complete" : "mail_regression_alert";
}

export interface OutboxInsert {
  id: string;
  workspace_id: string;
  user_id: string;
  job_id: string;
  kind: MailKind;
  to_address: string | null;
  locale: Locale;
  state: "queued" | "held";
  hold_reason: HoldReason | null;
  payload: Record<string, unknown>;
}

/** The full outbox row a claim hands to the sender. `lease_token` is non-null: claimDue always sets a fresh one. */
export interface ClaimedRow {
  id: string;
  workspace_id: string;
  user_id: string;
  job_id: string;
  kind: MailKind;
  to_address: string | null;
  locale: Locale;
  state: string;
  hold_reason: HoldReason | null;
  payload: Record<string, unknown>;
  attempts: number;
  lease_token: string;
  lease_until: Date;
  next_attempt_at: Date;
  created_at: Date;
}

export type FinishOutcome =
  | { state: "sent"; providerMessageId: string; toAddress: string }
  | { state: "retry"; nextAttemptAt: Date; error: string }
  | { state: "dead"; error: string }
  | { state: "held"; reason: HoldReason }
  | { state: "expired" };

export interface MemberMailSwitchUpdate {
  rescanComplete?: boolean;
  regressionAlert?: boolean;
  locale: Locale | null;
}

export interface MemberMailSwitches {
  rescanComplete: boolean;
  regressionAlert: boolean;
  locale: Locale | null;
}

export interface MailOutboxCounts {
  queued: number;
  dead: number;
  held: Record<HoldReason, number>;
}

export interface MailDeadRow {
  id: string;
  workspace_id: string;
  kind: MailKind;
  attempts: number;
  last_error: string | null;
  created_at: Date;
}

const EMPTY_HELD_COUNTS: Record<HoldReason, number> = {
  mail_unapproved: 0,
  kind_disabled: 0,
  opted_out: 0,
  no_address: 0,
  not_allowlisted: 0,
  not_member: 0,
};

/**
 * The mail outbox (docs/superpowers/specs/2026-09-27-mail-outbox-design.md
 * §§4,7): enqueue-time recipient facts, the leased skip-locked claim the
 * delivery tick uses, and the per-member switches the settings routes read
 * and write. `client` is required rather than defaulted to `getPool()`
 * (unlike most lib/repositories factories) because `recipients`/`insert` are
 * meant to run on the same PoolClient as the completion transaction that
 * writes the in-app notification, while the delivery tick and API routes
 * pass the plain Pool.
 */
export function mailOutboxRepository(client: Pool | PoolClient) {
  return {
    /**
     * Every accepted member with a linked user, for one workspace and mail
     * kind. `facts.accepted` is always true here -- a row already filtered to
     * `accepted_at IS NOT NULL` -- because this is the enqueue-time read;
     * `not_member` only becomes reachable through `sendFacts`, which re-reads
     * membership at send time.
     */
    async recipients(
      workspaceId: string,
      kind: MailKind,
    ): Promise<Array<{ userId: string; facts: RecipientFacts; locale: Locale | null }>> {
      const notifyCol = notifyColumn(kind);
      const memberCol = memberColumn(kind);
      const result = await client.query<{
        user_id: string;
        kind_allowed: boolean;
        opted_in: boolean;
        address: string | null;
        locale: Locale | null;
      }>(
        `SELECT m.user_id, w.${notifyCol} AS kind_allowed, m.${memberCol} AS opted_in, u.email AS address, m.mail_locale AS locale
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
         JOIN app_users u ON u.id = m.user_id
         WHERE m.workspace_id = $1 AND m.accepted_at IS NOT NULL AND m.user_id IS NOT NULL`,
        [workspaceId],
      );
      return result.rows.map((row) => ({
        userId: row.user_id,
        facts: { accepted: true, kindAllowed: row.kind_allowed, optedIn: row.opted_in, address: row.address },
        locale: row.locale,
      }));
    },

    /**
     * `on conflict (id) do nothing`: the deterministic id (completionId in
     * the enqueue caller) means a re-run completion, or a duplicate delivery
     * of the same enqueue call, inserts nothing extra and never resurrects or
     * resets a row that has since moved on (Review Focus 3).
     */
    async insert(rows: OutboxInsert[]): Promise<number> {
      if (!rows.length) return 0;
      const result = await client.query<{ id: string }>(
        `INSERT INTO mail_outbox(id,workspace_id,user_id,job_id,kind,to_address,locale,state,hold_reason,payload)
         SELECT x.id,x.workspace_id,x.user_id,x.job_id,x.kind,x.to_address,x.locale,x.state,x.hold_reason,x.payload
         FROM jsonb_to_recordset($1::jsonb) AS x(
           id uuid, workspace_id uuid, user_id uuid, job_id uuid, kind text,
           to_address text, locale text, state text, hold_reason text, payload jsonb)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [JSON.stringify(rows)],
      );
      return result.rows.length;
    },

    /**
     * One statement claims up to `limit` due rows -- queued/retry ready to
     * run, or a `sending` row whose lease expired (a crashed send, reclaimed
     * with a fresh token; Review Focus 4) -- locking them `FOR UPDATE SKIP
     * LOCKED` so concurrent tick invocations partition the due set instead of
     * racing for the same rows.
     */
    async claimDue(now: Date, limit: number): Promise<ClaimedRow[]> {
      const result = await client.query<ClaimedRow>(
        `WITH due AS (
           SELECT id FROM mail_outbox
           WHERE (state IN ('queued','retry') AND next_attempt_at <= $1)
              OR (state = 'sending' AND lease_until < $1)
           ORDER BY next_attempt_at
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         UPDATE mail_outbox m
         SET state = 'sending',
             lease_token = gen_random_uuid(),
             lease_until = $1::timestamptz + ($3 * interval '1 minute'),
             attempts = attempts + 1,
             updated_at = $1
         FROM due
         WHERE m.id = due.id
         RETURNING m.id, m.workspace_id, m.user_id, m.job_id, m.kind, m.to_address, m.locale,
                   m.state, m.hold_reason, m.payload, m.attempts, m.lease_token, m.lease_until,
                   m.next_attempt_at, m.created_at`,
        [now, limit, LEASE_MINUTES],
      );
      return result.rows;
    },

    /** Current membership/gate/switch/address for a claimed row, re-read just before sending. */
    async sendFacts(row: ClaimedRow): Promise<RecipientFacts> {
      const notifyCol = notifyColumn(row.kind);
      const memberCol = memberColumn(row.kind);
      const result = await client.query<{
        accepted: boolean;
        kind_allowed: boolean;
        opted_in: boolean;
        address: string | null;
      }>(
        `SELECT (m.accepted_at IS NOT NULL) AS accepted,
                w.${notifyCol} AS kind_allowed,
                coalesce(m.${memberCol}, false) AS opted_in,
                u.email AS address
         FROM workspaces w
         LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = $2 AND m.accepted_at IS NOT NULL
         LEFT JOIN app_users u ON u.id = $2
         WHERE w.id = $1`,
        [row.workspace_id, row.user_id],
      );
      const r = result.rows[0];
      if (!r) return { accepted: false, kindAllowed: false, optedIn: false, address: null };
      return { accepted: r.accepted, kindAllowed: r.kind_allowed, optedIn: r.opted_in, address: r.address };
    },

    /**
     * Finishes a claimed row, guarded by `id + lease_token + state='sending'`:
     * a send whose lease was reclaimed after expiry (Review Focus 4) holds a
     * stale token, so this changes nothing and returns false -- the new
     * holder's row (and its own eventual `finish`) is untouched.
     */
    async finish(id: string, leaseToken: string, outcome: FinishOutcome): Promise<boolean> {
      const guard = "WHERE id = $1 AND lease_token = $2 AND state = 'sending'";
      const clearLease = "lease_token = NULL, lease_until = NULL, updated_at = now()";
      let result;
      switch (outcome.state) {
        case "sent":
          result = await client.query(
            `UPDATE mail_outbox SET ${clearLease}, state='sent', provider_message_id=$3, to_address=$4, sent_at=now() ${guard} RETURNING id`,
            [id, leaseToken, outcome.providerMessageId, outcome.toAddress],
          );
          break;
        case "retry":
          result = await client.query(
            `UPDATE mail_outbox SET ${clearLease}, state='retry', next_attempt_at=$3, last_error=$4 ${guard} RETURNING id`,
            [id, leaseToken, outcome.nextAttemptAt, outcome.error],
          );
          break;
        case "dead":
          result = await client.query(`UPDATE mail_outbox SET ${clearLease}, state='dead', last_error=$3 ${guard} RETURNING id`, [
            id,
            leaseToken,
            outcome.error,
          ]);
          break;
        case "held":
          result = await client.query(`UPDATE mail_outbox SET ${clearLease}, state='held', hold_reason=$3 ${guard} RETURNING id`, [
            id,
            leaseToken,
            outcome.reason,
          ]);
          break;
        case "expired":
          result = await client.query(`UPDATE mail_outbox SET ${clearLease}, state='expired' ${guard} RETURNING id`, [id, leaseToken]);
          break;
      }
      return result.rows.length > 0;
    },

    /**
     * One transaction: flips the member's switch off (only for an accepted
     * member -- a removed/pending member changes nothing and reports
     * `member: false`) and holds that member's still-actionable rows of this
     * kind. When `client` is already a `PoolClient` it is presumed to be
     * inside a caller's own transaction (e.g. the unsubscribe route's single
     * connection); a bare `Pool` opens its own via `withTransaction`.
     */
    async optOut(userId: string, workspaceId: string, kind: MailKind): Promise<{ member: boolean }> {
      const memberCol = memberColumn(kind);
      const run = async (db: Executor): Promise<{ member: boolean }> => {
        const member = await db.query<{ id: string }>(
          `UPDATE workspace_members SET ${memberCol}=false
           WHERE workspace_id=$1 AND user_id=$2 AND accepted_at IS NOT NULL
           RETURNING id`,
          [workspaceId, userId],
        );
        if (!member.rows.length) return { member: false };
        await db.query(
          `UPDATE mail_outbox SET state='held', hold_reason='opted_out', updated_at=now()
           WHERE workspace_id=$1 AND user_id=$2 AND kind=$3 AND state IN ('queued','retry')`,
          [workspaceId, userId, kind],
        );
        return { member: true };
      };
      return isPoolClient(client) ? run(client) : withTransaction(run, client);
    },

    /** Updates only the provided switches; `locale` is always written (null clears it back to the market default). */
    async setMemberSwitches(workspaceId: string, userId: string, updates: MemberMailSwitchUpdate): Promise<void> {
      await client.query(
        `UPDATE workspace_members
         SET mail_rescan_complete = COALESCE($3, mail_rescan_complete),
             mail_regression_alert = COALESCE($4, mail_regression_alert),
             mail_locale = $5
         WHERE workspace_id=$1 AND user_id=$2 AND accepted_at IS NOT NULL`,
        [workspaceId, userId, updates.rescanComplete ?? null, updates.regressionAlert ?? null, updates.locale],
      );
    },

    /** Null when the caller has no accepted membership in this workspace. */
    async memberSwitches(workspaceId: string, userId: string): Promise<MemberMailSwitches | null> {
      const result = await client.query<{ mail_rescan_complete: boolean; mail_regression_alert: boolean; mail_locale: Locale | null }>(
        `SELECT mail_rescan_complete, mail_regression_alert, mail_locale
         FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND accepted_at IS NOT NULL`,
        [workspaceId, userId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return { rescanComplete: row.mail_rescan_complete, regressionAlert: row.mail_regression_alert, locale: row.mail_locale };
    },

    /** Ops health strip: backlog, dead-lettered and held-by-reason counts since `since`. */
    async counts(since: Date): Promise<MailOutboxCounts> {
      const result = await client.query<{ state: string; hold_reason: HoldReason | null; n: string }>(
        `SELECT state, hold_reason, count(*)::text AS n FROM mail_outbox WHERE created_at >= $1 GROUP BY state, hold_reason`,
        [since],
      );
      const held: Record<HoldReason, number> = { ...EMPTY_HELD_COUNTS };
      let queued = 0;
      let dead = 0;
      for (const row of result.rows) {
        const n = Number(row.n);
        if (row.state === "queued") queued += n;
        else if (row.state === "dead") dead += n;
        else if (row.state === "held" && row.hold_reason) held[row.hold_reason] += n;
      }
      return { queued, dead, held };
    },

    /** Dead rows for the operator failure list. Never selects `to_address` or `payload` -- no address ever leaves this query. */
    async deadRows(limit: number): Promise<MailDeadRow[]> {
      const result = await client.query<MailDeadRow>(
        `SELECT id, workspace_id, kind, attempts, last_error, created_at
         FROM mail_outbox WHERE state='dead' ORDER BY updated_at DESC LIMIT $1`,
        [limit],
      );
      return result.rows;
    },
  };
}

export type MailOutboxRepository = ReturnType<typeof mailOutboxRepository>;
