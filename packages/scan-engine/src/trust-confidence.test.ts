import { describe, expect, it } from "vitest";
import type { ProviderResult } from "./provider-result";
import { deriveTrustProvider, weakerConfidence } from "./trust-confidence";

describe("weakerConfidence", () => {
  it("takes low over high/low", () => {
    expect(weakerConfidence("high", "low")).toBe("low");
  });

  it("takes low over low/high", () => {
    expect(weakerConfidence("low", "high")).toBe("low");
  });

  it("takes medium over high/medium", () => {
    expect(weakerConfidence("high", "medium")).toBe("medium");
  });

  it("takes medium over medium/high", () => {
    expect(weakerConfidence("medium", "high")).toBe("medium");
  });

  it("returns high when both are high", () => {
    expect(weakerConfidence("high", "high")).toBe("high");
  });

  it("returns low when both are low", () => {
    expect(weakerConfidence("low", "low")).toBe("low");
  });
});

describe("deriveTrustProvider", () => {
  const collectedAt = "2026-08-04T00:00:00.000Z";

  it("takes the weaker of ig and gbp confidence when both are measured", () => {
    const ig: ProviderResult<unknown> = {
      status: "measured",
      data: null,
      confidence: "high",
      collectedAt: "2026-08-01T00:00:00.000Z",
    };
    const gbp: ProviderResult<unknown> = {
      status: "measured",
      data: null,
      confidence: "low",
      collectedAt: "2026-08-02T00:00:00.000Z",
    };

    expect(deriveTrustProvider(ig, gbp, collectedAt)).toEqual({
      status: "measured",
      data: null,
      confidence: "low",
      collectedAt,
    });
  });

  it("is unavailable when ig is not measured", () => {
    const ig: ProviderResult<unknown> = { status: "unavailable", limitationCode: "IG_PROVIDER_NOT_CONFIGURED" };
    const gbp: ProviderResult<unknown> = {
      status: "measured",
      data: null,
      confidence: "high",
      collectedAt: "2026-08-02T00:00:00.000Z",
    };

    expect(deriveTrustProvider(ig, gbp, collectedAt)).toEqual({
      status: "unavailable",
      limitationCode: "TRUST_NOT_MEASURED",
    });
  });

  it("is unavailable when gbp is not measured", () => {
    const ig: ProviderResult<unknown> = {
      status: "measured",
      data: null,
      confidence: "high",
      collectedAt: "2026-08-01T00:00:00.000Z",
    };
    const gbp: ProviderResult<unknown> = { status: "failed", limitationCode: "GBP_PROVIDER_TIMEOUT", retryable: true };

    expect(deriveTrustProvider(ig, gbp, collectedAt)).toEqual({
      status: "unavailable",
      limitationCode: "TRUST_NOT_MEASURED",
    });
  });
});
