import { describe, expect, it } from "vitest";

import { signInCopy } from "./sign-in-copy";

const hk = signInCopy["zh-HK"];
const tw = signInCopy["zh-TW"];

function strings(copy: typeof hk): string[] {
  return Object.values(copy).filter((value): value is string => typeof value === "string");
}

describe("sign-in copy locales", () => {
  // zh-TW was `{ ...zhHK }` with no overrides, so every string on this surface
  // silently carried Hong Kong register into Taiwan. Inheriting is the failure
  // mode, so these assert the markers rather than counting overrides: a future
  // spread would reintroduce the HK wording and fail here.
  it.each([
    ["核實", "查證"],
    ["電郵", "電子郵件"],
    ["收件箱", "收件匣"],
    ["未能", "無法"],
  ])("never ships the Hong Kong term %s in zh-TW (Taiwan uses %s)", (hkTerm) => {
    expect(strings(tw).filter(value => value.includes(hkTerm))).toEqual([]);
  });

  it("addresses the Taiwan reader as 您, the way the workspace copy already does", () => {
    // lib/copy-workspace.ts pins the same 你/您 split for the attribution
    // basis strings; the two surfaces must not disagree about the pronoun.
    expect(strings(tw).filter(value => value.includes("你"))).toEqual([]);
    expect(tw.title).toContain("您");
    expect(hk.title).toContain("你");
  });

  it("keeps every key present in all three locales", () => {
    const keys = Object.keys(signInCopy.en).sort();
    expect(Object.keys(hk).sort()).toEqual(keys);
    expect(Object.keys(tw).sort()).toEqual(keys);
  });

  it("still renders a retry countdown per locale", () => {
    for (const copy of [signInCopy.en, hk, tw]) {
      expect(copy.resendIn(30)).toContain("30");
    }
  });
});
