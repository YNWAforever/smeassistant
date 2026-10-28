import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";

export type ResearchProvider = "firecrawl" | "dataforseo";
export interface ResearchBudgetInput {
  workspaceId: string;
  locationId?: string | null;
  provider: ResearchProvider;
  /** Stable nonsecret billing-account key; never a credential or a workspace ID. */
  accountId: string;
  ceilingUsd: number;
  workspaceLimitUsd: number;
  accountLimitUsd: number;
  now?: Date;
}
export interface ResearchBudgetBalance { workspaceRemainingUsd: number; accountRemainingUsd: number; reservedUsd: number }
export type ResearchBudgetDecision = { allowed: boolean; reason?: string; budget: ResearchBudgetBalance };
export type ResearchReservation = (ResearchBudgetDecision & { allowed: true; reservationId: string }) | (ResearchBudgetDecision & { allowed: false });
export interface ResearchSettlement extends ResearchBudgetInput {
  reservationId: string;
  outcome: "ready" | "partial" | "empty" | "failed";
  reportedUsd?: number;
}
export interface ResearchBudgetRepository {
  status(input: ResearchBudgetInput): Promise<ResearchBudgetDecision>;
  reserve(input: ResearchBudgetInput): Promise<ResearchReservation>;
  settle(input: ResearchSettlement): Promise<ResearchBudgetDecision>;
}

const MICROS = 1_000_000;
function micros(value: number, allowZero = false): number {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error("research_budget_invalid");
  // Parse the decimal representation rather than rounding binary multiplication up.
  const [coefficient, exponent="0"] = value.toString().toLowerCase().split("e");
  const [whole, fraction=""] = coefficient.split(".");
  const digits = BigInt(whole + fraction), shift = 6 + Number(exponent) - fraction.length;
  const divisor = shift < 0 ? BigInt(10) ** BigInt(-shift) : BigInt(1);
  const amount = Number(shift >= 0 ? digits * BigInt(10) ** BigInt(shift) : (digits + divisor - BigInt(1)) / divisor);
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0) || !Number.isSafeInteger(amount)) throw new Error("research_budget_invalid");
  return amount;
}
function validate(input: ResearchBudgetInput): void {
  if (!input.workspaceId || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(input.accountId) || !["firecrawl", "dataforseo"].includes(input.provider)) throw new Error("research_budget_invalid");
  micros(input.ceilingUsd); micros(input.workspaceLimitUsd); micros(input.accountLimitUsd);
  if (!Number.isFinite((input.now ?? new Date()).getTime())) throw new Error("research_budget_invalid");
}
function month(input: ResearchBudgetInput): string { return `${(input.now ?? new Date()).toISOString().slice(0, 7)}-01`; }

/** Same lock order for every path. The workspace lock also covers different providers/accounts. */
async function lock(client: PoolClient, input: ResearchBudgetInput): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`conversation-research:workspace:${input.workspaceId}`]);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`conversation-research:account:${input.provider}:${input.accountId}`]);
}
async function balance(client: PoolClient, input: ResearchBudgetInput, period: string, reservedMicros = 0): Promise<ResearchBudgetBalance> {
  const row = (await client.query<{ workspace_used: string; account_used: string }>(`SELECT
    COALESCE(SUM(charged_microusd) FILTER (WHERE workspace_id=$1 AND month=$2::date),0)::text AS workspace_used,
    COALESCE(SUM(charged_microusd) FILTER (WHERE provider=$3 AND account_key=$4 AND month=$2::date),0)::text AS account_used
    FROM conversation_research_ledger
    WHERE month=$2::date AND (workspace_id=$1 OR (provider=$3 AND account_key=$4))`, [input.workspaceId, period, input.provider, input.accountId])).rows[0];
  const workspaceUsed = Number(row?.workspace_used), accountUsed = Number(row?.account_used);
  if (![workspaceUsed, accountUsed].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error("research_budget_invalid");
  return {
    workspaceRemainingUsd: Math.max(0, micros(input.workspaceLimitUsd) - workspaceUsed) / MICROS,
    accountRemainingUsd: Math.max(0, micros(input.accountLimitUsd) - accountUsed) / MICROS,
    reservedUsd: reservedMicros / MICROS,
  };
}
async function isBlocked(client: PoolClient, input: ResearchBudgetInput): Promise<boolean> {
  return Boolean((await client.query<{ blocked_at: string | null }>("SELECT blocked_at FROM conversation_research_accounts WHERE provider=$1 AND account_key=$2", [input.provider, input.accountId])).rows[0]?.blocked_at);
}
async function decision(client: PoolClient, input: ResearchBudgetInput): Promise<ResearchBudgetDecision> {
  const budget = await balance(client, input, month(input));
  if (await isBlocked(client, input)) return { allowed: false, reason: "pricing_ceiling_exceeded", budget };
  if (micros(budget.workspaceRemainingUsd, true) < micros(input.ceilingUsd)) return { allowed: false, reason: "workspace_budget_exhausted", budget };
  if (micros(budget.accountRemainingUsd, true) < micros(input.ceilingUsd)) return { allowed: false, reason: "account_budget_exhausted", budget };
  // A process crash or a failed settlement must not turn into an implicit retry.
  const pending = (await client.query<{ pending: boolean }>(`SELECT EXISTS(SELECT 1 FROM conversation_research_ledger
    WHERE provider=$1 AND account_key=$2 AND outcome='reserved') AS pending`, [input.provider, input.accountId])).rows[0]?.pending;
  if (pending !== false) return { allowed: false, reason: "account_reconciliation_pending", budget };
  return { allowed: true, budget };
}

/** All costs are integer micro-USD and monotonic. Nothing touches delivery usage. */
export function researchBudgetRepository(pool?: Pick<Pool, "connect">): ResearchBudgetRepository {
  const transaction = <T>(run: (client: PoolClient) => Promise<T>) => withTransaction(run, pool ?? getPool());
  return {
    async status(input) {
      validate(input);
      return transaction(async client => { await lock(client, input); return decision(client, input); });
    },
    async reserve(input) {
      validate(input);
      return transaction(async client => {
        await lock(client, input);
        const current = await decision(client, input);
        if (!current.allowed) return { ...current, allowed: false as const };
        const id = randomUUID(), ceiling = micros(input.ceilingUsd);
        await client.query(`INSERT INTO conversation_research_accounts(provider,account_key)
          VALUES($1,$2) ON CONFLICT(provider,account_key) DO NOTHING`, [input.provider, input.accountId]);
        await client.query(`INSERT INTO conversation_research_ledger(id,workspace_id,location_id,provider,account_key,month,reserved_microusd,charged_microusd)
          VALUES($1,$2,$3,$4,$5,$6::date,$7,$7)`, [id, input.workspaceId, input.locationId ?? null, input.provider, input.accountId, month(input), ceiling]);
        return { allowed: true as const, reservationId: id, budget: await balance(client, input, month(input), ceiling) };
      });
    },
    async settle(input) {
      validate(input);
      if (!["ready", "partial", "empty", "failed"].includes(input.outcome)) throw new Error("research_budget_invalid");
      const reported = input.reportedUsd === undefined ? undefined : micros(input.reportedUsd, true);
      return transaction(async client => {
        await lock(client, input);
        const row = (await client.query<{ month: string; reserved_microusd: string; charged_microusd: string }>(`SELECT month::text,reserved_microusd::text,charged_microusd::text
          FROM conversation_research_ledger WHERE id=$1 AND workspace_id=$2 AND provider=$3 AND account_key=$4
          AND location_id IS NOT DISTINCT FROM $5 FOR UPDATE`, [input.reservationId, input.workspaceId, input.provider, input.accountId, input.locationId ?? null])).rows[0];
        if (!row) throw new Error("research_reservation_missing");
        const reserved = Number(row.reserved_microusd), previous = Number(row.charged_microusd);
        if (![reserved, previous].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error("research_budget_invalid");
        const charged = Math.max(reserved, previous, reported ?? 0);
        await client.query(`UPDATE conversation_research_ledger SET charged_microusd=$2,
          reported_microusd=CASE WHEN $3::bigint IS NULL THEN reported_microusd ELSE GREATEST(COALESCE(reported_microusd,0),$3::bigint) END,
          outcome=$4,completed_at=now() WHERE id=$1`, [input.reservationId, charged, reported ?? null, input.outcome]);
        if (charged > reserved) {
          await client.query(`UPDATE conversation_research_accounts SET blocked_at=COALESCE(blocked_at,now()),block_reason='pricing_ceiling_exceeded'
            WHERE provider=$1 AND account_key=$2`, [input.provider, input.accountId]);
        }
        const budget = await balance(client, input, row.month, charged);
        return await isBlocked(client, input) ? { allowed: false, reason: "pricing_ceiling_exceeded", budget } : { allowed: true, budget };
      });
    },
  };
}
