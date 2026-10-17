import type { LLMUsage } from "@/lib/llm";
import { computeCostUsd } from "@/lib/agents/cost-model";

export interface ProviderUsageObservation {
  state: "reported" | "unknown" | "rejected";
  usage: LLMUsage;
  providerRequestId?: string;
  reason?: string;
  late?: boolean;
}
export interface ProviderAttempt extends Omit<ProviderUsageObservation, "state"> {
  id: string;
  sequence: number;
  startedAt: string;
  finishedAt?: string;
  model: string | null;
  state: "pending" | ProviderUsageObservation["state"];
  costUsd: number | null;
}
export interface ProviderUsageRecord {
  version: 1;
  attempts: Record<string, ProviderAttempt>;
  status: "pending" | "unknown" | "partial" | "complete";
  knownInputTokens: number;
  knownOutputTokens: number;
  knownCostUsd: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export function providerUsageFromInput(input: Record<string, unknown>): ProviderUsageRecord | null {
  const value = input.provider_usage;
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || (value as ProviderUsageRecord).version !== 1
      || !(value as ProviderUsageRecord).attempts || typeof (value as ProviderUsageRecord).attempts !== "object")
    throw new Error("invalid_provider_usage");
  return value as ProviderUsageRecord;
}

function summarize(attempts: Record<string, ProviderAttempt>): ProviderUsageRecord {
  const rows = Object.values(attempts);
  const sum = (values: Array<number | null>) => values.some(value => value === null) ? null : values.reduce<number>((total, value) => total + value!, 0);
  const inputs = rows.map(row => row.usage.inputTokens), outputs = rows.map(row => row.usage.outputTokens);
  const inputTokens = sum(inputs), outputTokens = sum(outputs), costUsd = sum(rows.map(row => row.costUsd));
  return { version: 1, attempts,
    status: rows.some(row => row.state === "pending") ? "pending" : rows.some(row => row.state === "unknown") ? "unknown"
      : inputTokens === null || outputTokens === null ? "partial" : "complete",
    inputTokens, outputTokens, costUsd: costUsd === null ? null : Math.round(costUsd * 1e6) / 1e6,
    knownInputTokens: inputs.reduce<number>((total, value) => total + (value ?? 0), 0),
    knownOutputTokens: outputs.reduce<number>((total, value) => total + (value ?? 0), 0),
    knownCostUsd: Math.round(rows.reduce((total, row) => total + (row.costUsd ?? 0), 0) * 1e6) / 1e6 };
}

export function beginProviderUsage(previous: ProviderUsageRecord | null, input: { id: string; model: string | null; startedAt: string }): ProviderUsageRecord {
  if (!input.id || !Number.isFinite(Date.parse(input.startedAt))) throw new Error("invalid_provider_attempt");
  const attempts = { ...previous?.attempts };
  if (attempts[input.id]) {
    if (attempts[input.id].model !== input.model) throw new Error("provider_attempt_conflict");
    return previous!;
  }
  attempts[input.id] = { ...input, sequence: Object.keys(attempts).length + 1, state: "pending",
    usage: { inputTokens: null, outputTokens: null }, costUsd: null };
  return summarize(attempts);
}
export function settleProviderUsage(previous: ProviderUsageRecord, id: string, observation: ProviderUsageObservation, finishedAt: string): ProviderUsageRecord {
  const attempt = previous.attempts[id];
  if (!attempt || !Number.isFinite(Date.parse(finishedAt))) throw new Error("unknown_provider_attempt");
  if (!["reported", "unknown", "rejected"].includes(observation.state)) throw new Error("invalid_provider_observation");
  for (const count of [observation.usage.inputTokens, observation.usage.outputTokens])
    if (count !== null && (!Number.isSafeInteger(count) || count < 0)) throw new Error("invalid_provider_usage");
  if (observation.providerRequestId && (observation.providerRequestId.length > 200 || /[\r\n]/.test(observation.providerRequestId)))
    throw new Error("invalid_provider_request_id");
  if (attempt.state === observation.state && attempt.usage.inputTokens === observation.usage.inputTokens
      && attempt.usage.outputTokens === observation.usage.outputTokens && attempt.providerRequestId === observation.providerRequestId
      && attempt.reason === observation.reason) return previous;
  if (attempt.state === "reported" || attempt.state === "rejected") {
    if (attempt.state !== observation.state || attempt.usage.inputTokens !== observation.usage.inputTokens
        || attempt.usage.outputTokens !== observation.usage.outputTokens || attempt.providerRequestId !== observation.providerRequestId)
      throw new Error("provider_settlement_conflict");
    return previous;
  }
  return summarize({ ...previous.attempts, [id]: { ...attempt, ...observation, finishedAt, costUsd: computeCostUsd(observation.usage, attempt.model) } });
}
