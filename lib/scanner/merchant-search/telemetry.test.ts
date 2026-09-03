import { describe, expect, it } from "vitest";
import { merchantSearchTelemetryEvent, serializeMerchantSearchTelemetry } from "./telemetry";

describe("merchant search telemetry", () => {
  it("keeps operational fields while excluding sensitive provider and user input", () => {
    const event = merchantSearchTelemetryEvent({
      correlationId: "corr-1",
      searchId: "search-1",
      market: "HK",
      language: "en",
      attempt: 2,
      outcome: "SUCCESS",
      latencyMs: 123,
      candidateCount: 3,
      confidenceCounts: { high: 1, medium: 1, low: 1 },
      cacheStatus: "miss",
    });
    expect(event).toEqual(expect.objectContaining({ correlationId: "corr-1", searchId: "search-1", attempt: 2 }));

    const serialized = serializeMerchantSearchTelemetry(event);
    for (const forbidden of ["Kam Man Kitchen", "maps.app.goo.gl", "serpapi.com", "api_key", "SERPAPI_KEY", "secret", "stack"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
