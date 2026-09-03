import { describe, expect, it } from "vitest";
import { CONFIDENCE_THRESHOLDS, RANKING_WEIGHTS, rankMerchantCandidates } from "./ranking";
import type { MerchantCandidate } from "./types";

function candidate(id: string, overrides: Partial<MerchantCandidate> = {}): MerchantCandidate {
  return { id, provider: "serpapi", name: id, alternateNames: [], permanentlyClosed: false, ...overrides };
}

describe("merchant candidate ranking", () => {
  it("keeps named weights and confidence thresholds public", () => {
    expect(RANKING_WEIGHTS.exactName).toBeGreaterThan(RANKING_WEIGHTS.looseName);
    expect(CONFIDENCE_THRESHOLDS.high).toBeGreaterThan(CONFIDENCE_THRESHOLDS.medium);
  });

  it("ranks exact normalized names above loose and typo matches", () => {
    const ranked = rankMerchantCandidates([
      candidate("loose", { name: "Kam Man Restaurant" }),
      candidate("exact", { name: "  Ｋａｍ Man Kitchen " }),
      candidate("typo", { name: "Kam Mann Kitchan" }),
    ], { query: "Kam Man Kitchen", market: "HK" });
    expect(ranked.map((row) => row.id)).toEqual(["exact", "typo", "loose"]);
  });

  it("makes a supplied provider identity dominate ordinary similarity", () => {
    const ranked = rankMerchantCandidates([
      candidate("exact", { name: "Kam Man Kitchen" }),
      candidate("identity", { name: "Kam Man Restaurant", dataId: "target" }),
    ], { query: "Kam Man Kitchen", market: "HK", dataId: "target" });
    expect(ranked[0]?.id).toBe("identity");
  });

  it("uses Happy Valley coordinates and market evidence", () => {
    const ranked = rankMerchantCandidates([
      candidate("far", { name: "Kam Man Kitchen", latitude: 22.45, longitude: 114.3, address: "Hong Kong" }),
      candidate("happy-valley", { name: "Kam Man Kitchen", latitude: 22.2690553, longitude: 114.1843662, address: "Happy Valley, Hong Kong" }),
    ], { query: "Kam Man Kitchen", market: "HK", latitude: 22.2691, longitude: 114.1844 });
    expect(ranked[0]?.id).toBe("happy-valley");
  });

  it("prefers selected-market evidence but keeps mismatches visible", () => {
    const ranked = rankMerchantCandidates([
      candidate("tw", { name: "Same Cafe", address: "Taipei, Taiwan", latitude: 25.033, longitude: 121.5654 }),
      candidate("hk", { name: "Same Cafe", address: "Central, Hong Kong", latitude: 22.2819, longitude: 114.1582 }),
    ], { query: "Same Cafe", market: "HK" });
    expect(ranked.map((row) => row.id)).toEqual(["hk", "tw"]);
    expect(ranked.find((row) => row.id === "tw")?.marketMismatch).toBe(true);
  });

  it("uses district, category, completeness, and closure evidence", () => {
    const ranked = rankMerchantCandidates([
      candidate("weak", { name: "Cafe", permanentlyClosed: true }),
      candidate("strong", { name: "Cafe", address: "Central, Hong Kong", category: "Restaurant", websiteUrl: "https://cafe.test", phone: "123" }),
    ], { query: "Cafe", market: "HK", district: "Central", category: "Restaurant" });
    expect(ranked[0]?.id).toBe("strong");
  });

  it("merges duplicate identities, preserves stable ties, and caps at eight", () => {
    const rows = [
      candidate("data:same", { name: "Cafe", dataId: "same", address: "Central" }),
      candidate("duplicate", { name: "Cafe", dataId: "same", websiteUrl: "https://cafe.test" }),
      ...Array.from({ length: 10 }, (_, index) => candidate(`tie-${index}`, { name: "Cafe" })),
    ];
    const ranked = rankMerchantCandidates(rows, { query: "Cafe", market: "HK" });
    expect(ranked).toHaveLength(8);
    expect(ranked.filter((row) => row.dataId === "same")).toHaveLength(1);
    expect(ranked.find((row) => row.dataId === "same")?.websiteUrl).toBe("https://cafe.test");
    const tieIds = ranked.filter((row) => row.id.startsWith("tie-")).map((row) => row.id);
    expect(tieIds).toEqual([...tieIds].sort((a, b) => Number(a.slice(4)) - Number(b.slice(4))));
  });

  it("assigns confidence without auto-selecting candidates", () => {
    const ranked = rankMerchantCandidates([
      candidate("high", { name: "Kam Man Kitchen", address: "Hong Kong", websiteUrl: "https://kam.test", phone: "123" }),
      candidate("low", { name: "Unrelated", address: "" }),
    ], { query: "Kam Man Kitchen", market: "HK" });
    expect(ranked[0]?.matchConfidence).toBe("high");
    expect(ranked.at(-1)?.matchConfidence).toBe("low");
    expect(ranked.every((row) => !("selected" in row))).toBe(true);
  });
});
