import { describe, expect, it } from "vitest";
import { mergeMerchantCandidates, normalizeSerpApiCandidate } from "./normalize-candidate";

describe("SerpApi candidate normalization", () => {
  it("normalizes every approved rich field", () => {
    expect(normalizeSerpApiCandidate({
      title: "Kam Man Kitchen",
      alternate_names: ["金萬餐廳"],
      address: "Happy Valley, Hong Kong",
      type: "Restaurant",
      website: "https://example.com/menu",
      phone: "+852 1234 5678",
      thumbnail: "https://images.example.com/a.jpg",
      gps_coordinates: { latitude: 22.2690553, longitude: 114.1843662 },
      rating: 4.3,
      reviews: 88,
      price: "$$",
      open_state: "Open",
      place_id: "ChIJ-place",
      data_id: "0x1:0x2",
      data_cid: "123",
    }, 0)).toEqual(expect.objectContaining({
      id: "place:ChIJ-place",
      provider: "serpapi",
      name: "Kam Man Kitchen",
      alternateNames: ["金萬餐廳"],
      address: "Happy Valley, Hong Kong",
      category: "Restaurant",
      websiteUrl: "https://example.com/menu",
      phone: "+852 1234 5678",
      thumbnailUrl: "https://images.example.com/a.jpg",
      latitude: 22.2690553,
      longitude: 114.1843662,
      rating: 4.3,
      reviews: 88,
      price: "$$",
      openState: "Open",
      permanentlyClosed: false,
      placeId: "ChIJ-place",
      dataId: "0x1:0x2",
      dataCid: "123",
    }));
  });

  it("prioritizes data IDs, CIDs, then a stable hash when place_id is absent", () => {
    expect(normalizeSerpApiCandidate({ title: "A", data_id: "d" }, 0)?.id).toBe("data:d");
    expect(normalizeSerpApiCandidate({ title: "A", data_cid: "c" }, 0)?.id).toBe("cid:c");
    expect(normalizeSerpApiCandidate({ title: "A", address: "One" }, 0)?.id)
      .toBe(normalizeSerpApiCandidate({ title: "A", address: "One" }, 9)?.id);
    expect(normalizeSerpApiCandidate({
      title: "A",
      gps_coordinates: { latitude: 22.28, longitude: 114.16 },
    }, 0)?.id).not.toBe(normalizeSerpApiCandidate({
      title: "A",
      gps_coordinates: { latitude: 22.31, longitude: 114.22 },
    }, 0)?.id);
  });

  it("drops invalid values and unsafe URLs", () => {
    const candidate = normalizeSerpApiCandidate({
      title: "Cafe",
      website: "javascript:alert(1)",
      thumbnail: "data:text/html,x",
      rating: "NaN",
      reviews: -2,
      gps_coordinates: { latitude: 999, longitude: 999 },
    }, 0);
    expect(candidate).toEqual(expect.objectContaining({ name: "Cafe" }));
    expect(candidate).not.toHaveProperty("websiteUrl");
    expect(candidate).not.toHaveProperty("thumbnailUrl");
    expect(candidate).not.toHaveProperty("rating");
    expect(candidate).not.toHaveProperty("reviews");
    expect(candidate).not.toHaveProperty("latitude");
  });

  it("rejects rows without a usable merchant name", () => {
    expect(normalizeSerpApiCandidate({ address: "Somewhere" }, 0)).toBeNull();
  });

  it("merges duplicate identifiers and retains complementary evidence", () => {
    const first = normalizeSerpApiCandidate({ title: "Cafe", data_id: "same", address: "Central" }, 0)!;
    const second = normalizeSerpApiCandidate({ title: "Cafe HK", data_id: "same", website: "https://cafe.test", phone: "123" }, 1)!;
    expect(mergeMerchantCandidates([first, second])).toEqual([
      expect.objectContaining({ id: "data:same", address: "Central", websiteUrl: "https://cafe.test", phone: "123" }),
    ]);
  });
});
