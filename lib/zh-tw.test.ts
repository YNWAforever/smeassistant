import { describe, expect, it } from "vitest";

import { toTaiwanWording, zhDeep, zhFor } from "./zh-tw";

describe("Taiwan wording", () => {
  it("swaps Hong Kong terms for Taiwan ones", () => {
    expect(toTaiwanWording("所有地點的店主私隱設定，由店主確認後上載")).toBe("所有據點的店家隱私設定，由店家確認後上傳");
    expect(toTaiwanWording("增長方案持續監察覆蓋率")).toBe("成長方案持續監控涵蓋率");
  });

  it("only changes zh-TW text", () => {
    expect(zhFor("zh-HK", "店主確認")).toBe("店主確認");
    expect(zhFor("zh-TW", "店主確認")).toBe("店家確認");
  });
});

describe("Google Business Profile in Taiwan", () => {
  it("uses Google's Taiwan name, 商家檔案", () => {
    expect(toTaiwanWording("只讀取商戶檔案及評論")).toBe("只讀取商家檔案及評論");
    expect(toTaiwanWording("Google 商戶檔案")).toBe("Google 商家檔案");
  });
});

describe("zhDeep", () => {
  it("converts nested copy and keeps icons and numbers", () => {
    const Icon = () => null;
    const block = { title: "店主確認", items: [{ name: "地點", icon: Icon, count: 3 }] };
    const tw = zhDeep("zh-TW", block);
    expect(tw).toEqual({ title: "店家確認", items: [{ name: "據點", icon: Icon, count: 3 }] });
    expect(tw.items[0].icon).toBe(Icon);
    expect(zhDeep("zh-HK", block)).toBe(block);
  });
});
