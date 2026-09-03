import { describe, expect, it } from "vitest";
import { resolveSearchTerm } from "./place-type-terms";

describe("resolveSearchTerm", () => {
  it("maps a known place type using the hk map", () => {
    expect(resolveSearchTerm(["cafe"], "餐飲", "hk")).toBe("咖啡店");
    expect(resolveSearchTerm(["chinese_restaurant"], "餐飲", "hk")).toBe("中菜");
  });
  it("uses the first mapped type when several are present", () => {
    expect(resolveSearchTerm(["point_of_interest", "bakery"], "餐飲", "hk")).toBe("麵包店");
  });
  it("maps a known place type using the tw map (distinct from hk)", () => {
    expect(resolveSearchTerm(["cafe"], "餐飲", "tw")).toBe("咖啡廳");
    expect(resolveSearchTerm(["cafe"], "餐飲", "hk")).toBe("咖啡店");
  });
  it("de-underscores an unmapped raw type", () => {
    expect(resolveSearchTerm(["pet_store"], "零售", "hk")).toBe("pet store");
  });
  it("falls back to the industry, then to 本地服務", () => {
    expect(resolveSearchTerm([], "美容", "hk")).toBe("美容");
    expect(resolveSearchTerm(undefined, "", "tw")).toBe("本地服務");
  });
});
