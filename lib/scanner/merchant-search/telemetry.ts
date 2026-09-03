import type { MerchantSearchLanguage } from "@sme-scanner/region";
import type { MerchantSearchMarket } from "./market";
import type { MerchantSearchOutcome } from "./types";

export interface MerchantSearchTelemetryEvent {
  event: "merchant_search_attempt";
  correlationId: string;
  searchId?: string;
  market: MerchantSearchMarket;
  language: MerchantSearchLanguage;
  attempt: number;
  outcome: MerchantSearchOutcome;
  latencyMs: number;
  candidateCount: number;
  confidenceCounts: { high: number; medium: number; low: number };
  cacheStatus: "hit" | "miss" | "store" | "bypass";
}

export function merchantSearchTelemetryEvent(
  input: Omit<MerchantSearchTelemetryEvent, "event">,
): MerchantSearchTelemetryEvent {
  return { event: "merchant_search_attempt", ...input };
}

export function serializeMerchantSearchTelemetry(event: MerchantSearchTelemetryEvent): string {
  return JSON.stringify(event);
}
