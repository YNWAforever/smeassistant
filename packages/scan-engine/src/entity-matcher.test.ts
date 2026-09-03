import { describe, expect, it } from "vitest";
import { matchMerchantCandidate, type MerchantEntity } from "./entity-matcher";

const entity = {
  businessName: "Happy Cafe",
  aliases: ["Happy Cafe", "開心冰室"],
  domain: "happycafe.hk",
  websiteUrl: "https://www.happycafe.hk/menu",
  placeId: "abc123",
  gbpName: "Happy Cafe 開心冰室",
  district: "銅鑼灣",
  categories: ["cafe", "restaurant"],
};

describe("matchMerchantCandidate", () => {
  it("returns high confidence for place id match", () => {
    const result = matchMerchantCandidate(entity, { title: "Other", placeId: "abc123" });
    expect(result).toMatchObject({ found: true, confidence: "high", matchedBy: ["place_id"] });
  });

  it("returns high confidence for official domain match", () => {
    const result = matchMerchantCandidate(entity, { link: "https://happycafe.hk/book" });
    expect(result.confidence).toBe("high");
    expect(result.matchedBy).toContain("domain");
  });

  it("returns medium confidence for exact alias in title", () => {
    const result = matchMerchantCandidate(entity, { title: "開心冰室 Happy Cafe 菜單" });
    expect(result.confidence).toBe("medium");
    expect(result.matchedBy).toContain("brand_alias");
  });

  it("does not match a longer Latin word that merely contains the alias", () => {
    const result = matchMerchantCandidate(entity, { title: "Happy Cafeteria" });
    expect(result.confidence).toBe("none");
  });

  it("returns none for similar but different merchant", () => {
    const result = matchMerchantCandidate(entity, { title: "Happy Coffee Roasters", snippet: "Central" });
    expect(result.confidence).toBe("none");
  });

  it("does not treat a shared social host as an official-domain match", () => {
    const socialEntity = {
      ...entity,
      domain: null,
      websiteUrl: "https://www.facebook.com/happycafe",
      placeId: null,
    };
    const result = matchMerchantCandidate(socialEntity, {
      title: "Some Other Shop",
      link: "https://www.facebook.com/someothershop",
    });
    expect(result.found).toBe(false);
    expect(result.confidence).toBe("none");
  });

  it("does not match a different merchant whose CJK name merely contains the alias", () => {
    const cjkEntity = {
      businessName: "華記",
      aliases: ["華記"],
      domain: null,
      websiteUrl: null,
      placeId: null,
      gbpName: null,
      district: "旺角",
      categories: [],
    };
    const result = matchMerchantCandidate(cjkEntity, { title: "中華記帳公司 旺角" });
    expect(result.confidence).toBe("none");
  });

  it("matches a Latin brand glued directly to Chinese text in the title", () => {
    const result = matchMerchantCandidate(entity, { title: "Happy Cafe銅鑼灣總店" });
    expect(result.found).toBe(true);
    expect(result.matchedBy).toContain("brand_alias");
  });
});

describe("matchMerchantCandidate fuzzy fallback", () => {
  const fuzzyEntity: MerchantEntity = {
    businessName: "The Hong Kong Medical Central Club",
    aliases: ["The Hong Kong Medical Central Club"],
    domain: null,
    websiteUrl: null,
    placeId: null,
    gbpName: null,
    district: "Central & Western",
    categories: [],
  };

  it("returns a low-confidence fuzzy match for a name variant without 'The'", () => {
    const match = matchMerchantCandidate(fuzzyEntity, { title: "Hong Kong Medical Central Club" });
    expect(match.found).toBe(true);
    expect(match.confidence).toBe("low");
    expect(match.matchedBy).toContain("fuzzy_name");
  });

  it("still returns none for an unrelated business", () => {
    const match = matchMerchantCandidate(fuzzyEntity, { title: "Causeway Bay Pet Grooming Studio" });
    expect(match.found).toBe(false);
    expect(match.confidence).toBe("none");
  });

  it("still returns high confidence for an exact alias match (unaffected by the fuzzy fallback)", () => {
    const match = matchMerchantCandidate(fuzzyEntity, { title: "The Hong Kong Medical Central Club — Central" });
    expect(match.confidence).toBe("medium");
    expect(match.matchedBy).toContain("brand_alias");
  });
});
