import type { LLMUsage } from "@/lib/llm";

// Ported verbatim from upstream apps/web/lib/agents/cost-model.ts.
//
// Per-1K-token rate for the default gateway model (lib/llm.ts's OPENCODE_MODEL,
// deepseek-v4-flash). Override via env if the deployed model changes -- this
// is the first feature in the repo to persist LLM cost, so there is no
// existing per-model table to extend.
const DEFAULT_INPUT_RATE_PER_1K = 0.0002;
const DEFAULT_OUTPUT_RATE_PER_1K = 0.0008;

function envRate(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Null when usage is incomplete -- an honest missing cost, not a wrong one. */
export function computeCostUsd(usage: LLMUsage): number | null {
  if (usage.inputTokens === null || usage.outputTokens === null) return null;
  const inputRate = envRate("LLM_COST_PER_1K_INPUT_TOKENS_USD", DEFAULT_INPUT_RATE_PER_1K);
  const outputRate = envRate("LLM_COST_PER_1K_OUTPUT_TOKENS_USD", DEFAULT_OUTPUT_RATE_PER_1K);
  const cost = (usage.inputTokens / 1000) * inputRate + (usage.outputTokens / 1000) * outputRate;
  return Math.round(cost * 1e6) / 1e6;
}
