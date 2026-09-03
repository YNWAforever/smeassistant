import { describe, expect, it } from "vitest";
import { buildInstagramSearchQuery } from "./query";

describe("buildInstagramSearchQuery", () => {
  it("quotes the business name and scopes the search to instagram.com", () => {
    expect(buildInstagramSearchQuery({ businessName: "金萬餐廳", market: "HK", district: "跑馬地" }))
      .toBe('site:instagram.com "金萬餐廳" 跑馬地 Hong Kong');
  });

  it("drops a recognized legal suffix that no Instagram profile carries", () => {
    expect(buildInstagramSearchQuery({ businessName: "金萬餐廳有限公司", market: "HK", district: "跑馬地" }))
      .toBe('site:instagram.com "金萬餐廳" 跑馬地 Hong Kong');
  });

  it("uses the TW market term for TW", () => {
    expect(buildInstagramSearchQuery({ businessName: "永和豆漿", market: "TW", district: "大安區" }))
      .toBe('site:instagram.com "永和豆漿" 大安區 Taiwan');
  });

  it("does not append a market term the query already carries", () => {
    expect(buildInstagramSearchQuery({ businessName: "Hong Kong Coffee", market: "HK", district: "中環" }))
      .toBe('site:instagram.com "Hong Kong Coffee" 中環');
  });

  it("omits the district when none is supplied", () => {
    expect(buildInstagramSearchQuery({ businessName: "金萬餐廳", market: "HK" }))
      .toBe('site:instagram.com "金萬餐廳" Hong Kong');
  });

  it("strips double quotes from the name so the operator cannot be broken out of", () => {
    expect(buildInstagramSearchQuery({ businessName: 'Kam" OR site:evil.example', market: "HK" }))
      .toBe('site:instagram.com "Kam OR site:evil.example" Hong Kong');
  });

  it("returns an empty string when the name has no meaningful characters", () => {
    expect(buildInstagramSearchQuery({ businessName: "   ", market: "HK", district: "中環" })).toBe("");
  });
});
