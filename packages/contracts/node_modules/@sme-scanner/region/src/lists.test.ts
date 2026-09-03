import { describe, it, expect } from "vitest";
import { INDUSTRIES_HK, INDUSTRIES_TW, DISTRICTS_HK, DISTRICTS_TW } from "./lists";

describe("region lists", () => {
  it("TW keeps identical industry values (benchmark keys) as HK", () => {
    expect(INDUSTRIES_TW.map((i) => i.value)).toEqual(INDUSTRIES_HK.map((i) => i.value));
  });
  it("TW has 22 cities/counties", () => {
    expect(DISTRICTS_TW).toHaveLength(22);
    expect(DISTRICTS_TW[0].zh).toBe("臺北市");
  });
  it("HK still has 18 districts", () => {
    expect(DISTRICTS_HK).toHaveLength(18);
  });
});

describe("district SerpAPI geo anchors", () => {
  const LL_RE = /^@(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d{1,2})z$/;

  it("every HK district has a verified in-market anchor", () => {
    for (const d of DISTRICTS_HK) {
      expect(d.serpLocation, d.zh).toMatch(/,Hong Kong$/);
      const m = d.mapsLl?.match(LL_RE);
      expect(m, `${d.zh} mapsLl format`).toBeTruthy();
      const [lat, lng] = [Number(m![1]), Number(m![2])];
      expect(lat, `${d.zh} lat`).toBeGreaterThan(22.1);
      expect(lat, `${d.zh} lat`).toBeLessThan(22.6);
      expect(lng, `${d.zh} lng`).toBeGreaterThan(113.8);
      expect(lng, `${d.zh} lng`).toBeLessThan(114.5);
    }
  });

  it("every TW city/county except 連江縣 has a verified in-market anchor", () => {
    for (const d of DISTRICTS_TW) {
      if (d.zh === "連江縣") {
        // Absent from SerpAPI's locations DB — must fall back to the market anchor.
        expect(d.serpLocation).toBeUndefined();
        expect(d.mapsLl).toBeUndefined();
        continue;
      }
      expect(d.serpLocation, d.zh).toMatch(/,Taiwan$/);
      const m = d.mapsLl?.match(LL_RE);
      expect(m, `${d.zh} mapsLl format`).toBeTruthy();
      const [lat, lng] = [Number(m![1]), Number(m![2])];
      expect(lat, `${d.zh} lat`).toBeGreaterThan(21.8);
      expect(lat, `${d.zh} lat`).toBeLessThan(25.4);
      expect(lng, `${d.zh} lng`).toBeGreaterThan(118.2);
      expect(lng, `${d.zh} lng`).toBeLessThan(122.1);
    }
  });

  it("anchors are unique — no copy-paste duplicates", () => {
    for (const districts of [DISTRICTS_HK, DISTRICTS_TW]) {
      const locations = districts.map((d) => d.serpLocation).filter(Boolean);
      expect(new Set(locations).size).toBe(locations.length);
      const lls = districts.map((d) => d.mapsLl).filter(Boolean);
      expect(new Set(lls).size).toBe(lls.length);
    }
  });
});
