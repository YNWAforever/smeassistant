import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSiteUrl,
  reportPath,
  absoluteReportUrl,
  interpolate,
  whatsappHref,
  facebookHref,
  scoreBand,
  buildShareCardData,
} from "./share";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL and strips trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://smescanner.fimmick.com/");
    expect(getSiteUrl()).toBe("https://smescanner.fimmick.com");
  });
  it("falls back to VERCEL_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "preview-abc.vercel.app");
    expect(getSiteUrl()).toBe("https://preview-abc.vercel.app");
  });
  it("falls back to localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });
});

describe("reportPath / absoluteReportUrl", () => {
  it("prefixes the default locale too (every locale is prefixed here)", () => {
    expect(reportPath("zh-HK", "abc")).toBe("/zh-HK/r/abc");
  });
  it("prefixes en and zh-TW", () => {
    expect(reportPath("en", "abc")).toBe("/en/r/abc");
    expect(reportPath("zh-TW", "abc")).toBe("/zh-TW/r/abc");
  });
  it("builds an absolute url", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x.com");
    expect(absoluteReportUrl("en", "abc")).toBe("https://x.com/en/r/abc");
  });
});

describe("interpolate", () => {
  it("replaces named tokens", () => {
    expect(interpolate("{business}: {score}/100", { business: "Cafe", score: 76 })).toBe("Cafe: 76/100");
  });
  it("blanks unknown tokens", () => {
    expect(interpolate("{a}{b}", { a: "x" })).toBe("x");
  });
});

describe("share hrefs", () => {
  it("whatsapp encodes text and url together", () => {
    expect(whatsappHref("hi 👀", "https://x.com/r/a")).toBe(
      "https://wa.me/?text=" + encodeURIComponent("hi 👀 https://x.com/r/a"),
    );
  });
  it("facebook encodes the url", () => {
    expect(facebookHref("https://x.com/r/a")).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent("https://x.com/r/a"),
    );
  });
});

describe("scoreBand", () => {
  it("maps boundaries", () => {
    expect(scoreBand(70)).toBe("good");
    expect(scoreBand(69)).toBe("warn");
    expect(scoreBand(50)).toBe("warn");
    expect(scoreBand(49)).toBe("critical");
  });
});

describe("buildShareCardData", () => {
  it("returns a found card with rounded module scores", () => {
    const data = buildShareCardData({
      business_name: "Happy Salon",
      overall_score: 76.4,
      module_scores: { ig: { score: 82 }, gbp: { score: 71 }, aeo: { score: 60 }, trust: { score: 90 } },
    });
    expect(data).toEqual({
      businessName: "Happy Salon",
      score: 76,
      band: "good",
      found: true,
      modules: [
        { key: "ig", score: 82 },
        { key: "gbp", score: 71 },
        { key: "aeo", score: 60 },
      ],
    });
  });
  it("leaves unmeasured modules off the card instead of showing 0", () => {
    const data = buildShareCardData({
      business_name: "Kam Man",
      overall_score: 62,
      module_scores: { gbp: { score: 72 }, aeo: { score: 47 } },
      module_results: {
        ig: { status: "unavailable", score: null, confidence: "low", evidenceCollectedAt: null, limitationCode: "IG_HANDLE_NOT_PROVIDED" },
        gbp: { status: "measured", score: 72.4, confidence: "medium", evidenceCollectedAt: null, limitationCode: null },
        aeo: { status: "measured", score: 47, confidence: "medium", evidenceCollectedAt: null, limitationCode: null },
      },
    });
    expect(data.modules).toEqual([{ key: "gbp", score: 72 }, { key: "aeo", score: 47 }]);
  });
  it("prefers module_results over a legacy module score for a module that was not measured", () => {
    const data = buildShareCardData({
      business_name: "X",
      overall_score: 50,
      module_scores: { ig: { score: 0 } },
      module_results: { ig: { status: "failed", score: null, confidence: "low", evidenceCollectedAt: null, limitationCode: null } },
    });
    expect(data.modules).toEqual([]);
  });
  it("skips a legacy module with no numeric score", () => {
    const data = buildShareCardData({ business_name: "X", overall_score: 50, module_scores: { gbp: { score: 70 } } });
    expect(data.modules).toEqual([{ key: "gbp", score: 70 }]);
  });
  it("returns a fallback card when job is null", () => {
    expect(buildShareCardData(null).found).toBe(false);
  });
  it("returns a fallback card when score is missing", () => {
    expect(buildShareCardData({ business_name: "X", overall_score: null, module_scores: null }).found).toBe(false);
  });
});
