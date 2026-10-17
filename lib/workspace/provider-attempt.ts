import { randomUUID } from "node:crypto";
import type { LLMOptions, LLMOutcome } from "@/lib/llm";
import type { ProviderUsageObservation } from "./provider-usage";
import type { ActionRunRepository, ProviderUsageAttribution } from "@/lib/repositories/artifacts";

type Recorder = Pick<ActionRunRepository, "beginProviderAttempt" | "observeProviderAttempt">;
/** Existing injected legacy test/adapter capabilities do not claim tracked transport. */
function recorderOf(value: unknown): Recorder | null {
  const recorder = value as Partial<Recorder> | null;
  return typeof recorder?.beginProviderAttempt === "function" && typeof recorder.observeProviderAttempt === "function"
    ? recorder as Recorder : null;
}

export async function invokeProviderAttempt(input: {
  persistence: unknown;
  attribution: Omit<ProviderUsageAttribution, "attemptId">;
  model: string | null;
  options: LLMOptions;
  call: (options: LLMOptions) => Promise<LLMOutcome>;
}): Promise<LLMOutcome> {
  const recorder = recorderOf(input.persistence);
  if (!recorder) return input.call(input.options);
  const attribution = { ...input.attribution, attemptId: randomUUID() };
  // Must commit before any network effect. A failure cannot spend then lose
  // the existence/identity of the request.
  await recorder.beginProviderAttempt({ ...attribution, model: input.model, startedAt: new Date() });
  let observationAttempted = false;
  const observe = async (observation: ProviderUsageObservation) => {
    observationAttempted = true;
    await recorder.observeProviderAttempt({ ...attribution, observation, finishedAt: new Date() });
  };
  let outcome: LLMOutcome;
  try {
    outcome = await input.call({ ...input.options, onUsageObservation: observe });
  } catch {
    await observe({ state: "unknown", usage: { inputTokens: null, outputTokens: null }, reason: "network_error" });
    return { ok: false, code: "network_error", retryable: false, usagePending: true };
  }
  if (!observationAttempted && !(outcome.ok === false && outcome.usagePending)) {
    // Legacy injected completions still report real measured usage. The
    // native transport calls observe itself, including after logical timeout.
    const notSent = !outcome.ok && ["ai_paused", "provider_unconfigured"].includes(outcome.code);
    const ambiguous = !outcome.ok && ["timeout", "network_error", "usage_record_failed"].includes(outcome.code);
    await observe({
      state: outcome.ok ? "reported" : ambiguous ? "unknown" : "rejected",
      usage: notSent ? { inputTokens: 0, outputTokens: 0 }
        : (outcome.ok ? outcome.result.usage : outcome.usage) ?? { inputTokens: null, outputTokens: null },
      ...(!outcome.ok ? { reason: outcome.code } : {}),
    });
    if (ambiguous) return { ...outcome, ok: false, retryable: false, usagePending: true } as LLMOutcome;
  }
  return outcome;
}
