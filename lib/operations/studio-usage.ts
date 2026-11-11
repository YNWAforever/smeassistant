import type { Pool } from "pg";

/**
 * Read-only Studio usage telemetry (v1.1 P2.1).
 *
 * The report is derived from persisted rows only: conversation/message counts,
 * turn latency (the next assistant reply after a user turn in the same
 * conversation), token/cost totals, intents/models and a daily series. It never
 * selects message content or parts text; only counts and the `warning` part
 * kind (used to count failed turns).
 *
 * Cost/token columns are nullable: an unreported value is null and is counted as
 * zero only for the sum, with `unknownCostMessages` making that visible.
 */

export type StudioUsageOptions = {
  since: Date;
  workspaceId?: string;
  /** Alert when reported cost exceeds this amount. */
  maxCostUsd?: number;
  /** Alert when the p95 adjacent-turn latency exceeds this many milliseconds. */
  maxP95LatencyMs?: number;
};

export type StudioUsageBudgetReport = {
  maxCostUsd: number | null;
  maxP95LatencyMs: number | null;
  breaches: Array<"cost" | "p95_latency">;
};

export type StudioUsageReport = {
  window: { since: string; until: string; workspaceId: string | null };
  totals: {
    conversations: number;
    owners: number;
    userMessages: number;
    assistantMessages: number;
    failedTurns: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    unknownCostMessages: number;
  };
  latencyMs: { samples: number; average: number | null; p50: number | null; p95: number | null };
  byIntent: Array<{ intent: string; count: number }>;
  byModel: Array<{ model: string; count: number }>;
  byDay: Array<{ day: string; userMessages: number; assistantMessages: number; costUsd: number }>;
  budgets: StudioUsageBudgetReport;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const STUDIO_USAGE_MAX_DAYS = 365;

/** Parses `--days`, `--workspace-id`; throws a plain message for the CLI to print. */
export function parseStudioUsageArgs(argv: string[], now: Date = new Date()): { options: StudioUsageOptions; help: boolean } {
  let days = 30;
  let workspaceId: string | undefined;
  let maxCostUsd: number | undefined;
  let maxP95LatencyMs: number | undefined;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") { help = true; continue; }
    if (arg === "--days") {
      const raw = argv[index + 1];
      const parsed = Number(raw);
      if (!raw || !Number.isInteger(parsed) || parsed < 1 || parsed > STUDIO_USAGE_MAX_DAYS) {
        throw new Error(`--days must be an integer from 1 to ${STUDIO_USAGE_MAX_DAYS}`);
      }
      days = parsed;
      index += 1;
      continue;
    }
    if (arg === "--max-cost-usd") {
      const raw = argv[index + 1];
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed < 0) throw new Error("--max-cost-usd must be a non-negative number");
      maxCostUsd = parsed;
      index += 1;
      continue;
    }
    if (arg === "--max-p95-ms") {
      const raw = argv[index + 1];
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed < 0) throw new Error("--max-p95-ms must be a non-negative number");
      maxP95LatencyMs = parsed;
      index += 1;
      continue;
    }
    if (arg === "--workspace-id") {
      const raw = argv[index + 1];
      if (!raw || !UUID.test(raw)) throw new Error("--workspace-id must be a UUID");
      workspaceId = raw.toLowerCase();
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    options: {
      since,
      ...(workspaceId ? { workspaceId } : {}),
      ...(maxCostUsd !== undefined ? { maxCostUsd } : {}),
      ...(maxP95LatencyMs !== undefined ? { maxP95LatencyMs } : {}),
    },
    help,
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/** Pure threshold evaluation shared by the CLI and unit tests. */
export function evaluateStudioUsageBudgets(
  usage: { costUsd: number; p95: number | null },
  options: Pick<StudioUsageOptions, "maxCostUsd" | "maxP95LatencyMs">,
): StudioUsageBudgetReport {
  const maxCostUsd = options.maxCostUsd ?? null;
  const maxP95LatencyMs = options.maxP95LatencyMs ?? null;
  const breaches: StudioUsageBudgetReport["breaches"] = [];
  if (maxCostUsd !== null && usage.costUsd > maxCostUsd) breaches.push("cost");
  if (maxP95LatencyMs !== null && usage.p95 !== null && usage.p95 > maxP95LatencyMs) breaches.push("p95_latency");
  return { maxCostUsd, maxP95LatencyMs, breaches };
}

export async function buildStudioUsageReport(
  pool: Pick<Pool, "query">,
  options: StudioUsageOptions,
  now: Date = new Date(),
): Promise<StudioUsageReport> {
  const since = options.since;
  if (!(since instanceof Date) || Number.isNaN(since.getTime())) throw new Error("since must be a valid Date");
  const workspaceId = options.workspaceId ?? null;
  if (workspaceId !== null && !UUID.test(workspaceId)) throw new Error("workspaceId must be a UUID");
  const params = [since.toISOString(), workspaceId];
  const scope = "m.created_at >= $1::timestamptz AND ($2::uuid IS NULL OR c.workspace_id=$2::uuid)";

  const totals = (
    await pool.query<{
      conversations: number; owners: number; user_messages: number; assistant_messages: number;
      failed_turns: number; input_tokens: number; output_tokens: number; cost_usd: number; unknown_cost_messages: number;
    }>(
      `SELECT
         count(DISTINCT c.id)::int AS conversations,
         count(DISTINCT c.created_by)::int AS owners,
         count(*) FILTER (WHERE m.role='user')::int AS user_messages,
         count(*) FILTER (WHERE m.role='assistant')::int AS assistant_messages,
         count(*) FILTER (WHERE m.role='assistant' AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(m.parts) part WHERE part->>'kind'='warning'))::int AS failed_turns,
         COALESCE(sum(m.input_tokens),0)::int AS input_tokens,
         COALESCE(sum(m.output_tokens),0)::int AS output_tokens,
         COALESCE(sum(m.cost_usd),0)::float8 AS cost_usd,
         count(*) FILTER (WHERE m.role='assistant' AND m.cost_usd IS NULL)::int AS unknown_cost_messages
       FROM studio_messages m
       JOIN studio_conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id
       WHERE ${scope}`,
      params,
    )
  ).rows[0];

  const latency = (
    await pool.query<{ samples: number; average: number | null; p50: number | null; p95: number | null }>(
      `WITH ordered AS (
         SELECT m.role, m.created_at,
                lag(m.role) OVER w AS previous_role,
                lag(m.created_at) OVER w AS previous_at
         FROM studio_messages m
         JOIN studio_conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id
         WHERE ${scope}
         WINDOW w AS (PARTITION BY m.conversation_id ORDER BY m.seq)
       ), pairs AS (
         SELECT extract(epoch FROM (created_at - previous_at))*1000 AS latency_ms
         FROM ordered
         WHERE role='assistant' AND previous_role='user' AND previous_at IS NOT NULL AND created_at >= previous_at
       )
       SELECT count(*)::int AS samples,
              avg(latency_ms)::float8 AS average,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float8 AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float8 AS p95
       FROM pairs`,
      params,
    )
  ).rows[0];

  const byIntent = (
    await pool.query<{ intent: string; count: number }>(
      `SELECT COALESCE(m.intent,'chat') AS intent, count(*)::int AS count
       FROM studio_messages m
       JOIN studio_conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id
       WHERE ${scope} AND m.role='assistant'
       GROUP BY 1 ORDER BY count DESC, intent`,
      params,
    )
  ).rows;

  const byModel = (
    await pool.query<{ model: string; count: number }>(
      `SELECT COALESCE(m.model,'unknown') AS model, count(*)::int AS count
       FROM studio_messages m
       JOIN studio_conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id
       WHERE ${scope} AND m.role='assistant'
       GROUP BY 1 ORDER BY count DESC, model`,
      params,
    )
  ).rows;

  const byDay = (
    await pool.query<{ day: string; user_messages: number; assistant_messages: number; cost_usd: number }>(
      `SELECT to_char(date_trunc('day', m.created_at AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS day,
              count(*) FILTER (WHERE m.role='user')::int AS user_messages,
              count(*) FILTER (WHERE m.role='assistant')::int AS assistant_messages,
              COALESCE(sum(m.cost_usd),0)::float8 AS cost_usd
       FROM studio_messages m
       JOIN studio_conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id
       WHERE ${scope}
       GROUP BY 1 ORDER BY day`,
      params,
    )
  ).rows;

  const budgets = evaluateStudioUsageBudgets(
    { costUsd: numberValue(totals?.cost_usd), p95: nullableNumber(latency?.p95) },
    options,
  );

  return {
    window: {
      since: since.toISOString(),
      until: now.toISOString(),
      workspaceId,
    },
    totals: {
      conversations: numberValue(totals?.conversations),
      owners: numberValue(totals?.owners),
      userMessages: numberValue(totals?.user_messages),
      assistantMessages: numberValue(totals?.assistant_messages),
      failedTurns: numberValue(totals?.failed_turns),
      inputTokens: numberValue(totals?.input_tokens),
      outputTokens: numberValue(totals?.output_tokens),
      costUsd: numberValue(totals?.cost_usd),
      unknownCostMessages: numberValue(totals?.unknown_cost_messages),
    },
    latencyMs: {
      samples: numberValue(latency?.samples),
      average: nullableNumber(latency?.average),
      p50: nullableNumber(latency?.p50),
      p95: nullableNumber(latency?.p95),
    },
    byIntent: byIntent.map((row) => ({ intent: String(row.intent), count: numberValue(row.count) })),
    byModel: byModel.map((row) => ({ model: String(row.model), count: numberValue(row.count) })),
    byDay: byDay.map((row) => ({
      day: String(row.day),
      userMessages: numberValue(row.user_messages),
      assistantMessages: numberValue(row.assistant_messages),
      costUsd: numberValue(row.cost_usd),
    })),
    budgets,
  };
}
