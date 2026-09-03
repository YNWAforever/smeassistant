import { describe, expect, it, vi } from "vitest";
import { createReportLanguageService, type ExecutiveSummarySource } from "./language-service";

function source(overrides: Partial<ExecutiveSummarySource> = {}): ExecutiveSummarySource {
  return {
    jobId: "job-1",
    businessName: "Acme",
    industry: "retail",
    district: "Central",
    overallScore: 80,
    cached: { summary_zh: null, summary_en: null, summary_tw: null },
    findings: [{ module: "ig", owner_message_zh: "Improve the profile", score_impact: -2 }],
    ...overrides,
  };
}

function deps() {
  return {
    configured: vi.fn().mockReturnValue(true),
    generate: vi.fn().mockResolvedValue("A generated summary"),
  };
}

describe("createReportLanguageService", () => {
  it("returns a cached summary without calling the provider", async () => {
    const service = createReportLanguageService(deps());

    const result = await service.resolveSummary(
      source({ cached: { summary_zh: "Base summary", summary_en: null, summary_tw: null } }),
      "en",
      vi.fn(),
    );

    expect(result).toBe("Base summary");
  });

  it("returns null when no provider is configured", async () => {
    const service = createReportLanguageService({
      configured: vi.fn().mockReturnValue(false),
      generate: vi.fn(),
    });

    const result = await service.resolveSummary(source(), "en", vi.fn());

    expect(result).toBeNull();
  });

  it("delegates generation and forwards a fire-and-forget cache callback", async () => {
    const cache = vi.fn();
    const service = createReportLanguageService(deps());

    await expect(service.resolveSummary(source(), "en", cache)).resolves.toBe("A generated summary");

    expect(cache).toHaveBeenCalledWith("job-1", "summary_en", "A generated summary");
  });

  it("returns null when the provider fails", async () => {
    const service = createReportLanguageService({
      configured: vi.fn().mockReturnValue(true),
      generate: vi.fn().mockResolvedValue(null),
    });

    const result = await service.resolveSummary(source(), "en", vi.fn());

    expect(result).toBeNull();
  });

  it("uses the same summary policy as resolveExecutiveSummary for zh-HK cache routing", async () => {
    const cache = vi.fn();
    const service = createReportLanguageService(deps());

    await service.resolveSummary(source(), "zh-HK", cache);

    expect(cache).toHaveBeenCalledWith("job-1", "summary_zh", "A generated summary");
  });
});
