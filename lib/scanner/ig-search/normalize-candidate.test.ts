import { describe, expect, it } from "vitest";
import { normalizeInstagramOrganicResult } from "./normalize-candidate";

describe("normalizeInstagramOrganicResult", () => {
  it("builds a picker_confirmed candidate from a profile result", () => {
    expect(normalizeInstagramOrganicResult({
      link: "https://www.instagram.com/kamman.hk/",
      title: "金萬餐廳 (@kamman.hk) • Instagram photos and videos",
      snippet: "跑馬地成和道 1 號 · 廣東菜",
    })).toEqual({
      id: "ig:kamman.hk",
      handle: "kamman.hk",
      profileUrl: "https://www.instagram.com/kamman.hk/",
      provenance: "picker_confirmed",
      displayName: "金萬餐廳",
      bioSnippet: "跑馬地成和道 1 號 · 廣東菜",
    });
  });

  it("falls back to no display name when the title is only the suffix", () => {
    const candidate = normalizeInstagramOrganicResult({
      link: "https://www.instagram.com/kamman.hk/",
      title: "(@kamman.hk) • Instagram",
    });
    expect(candidate?.handle).toBe("kamman.hk");
    expect(candidate?.displayName).toBeUndefined();
  });

  it("truncates a long snippet to 200 characters", () => {
    const candidate = normalizeInstagramOrganicResult({
      link: "https://www.instagram.com/kamman.hk/",
      title: "金萬餐廳",
      snippet: "x".repeat(400),
    });
    expect(candidate?.bioSnippet).toHaveLength(200);
  });

  it("rejects non-profile Instagram links", () => {
    expect(normalizeInstagramOrganicResult({
      link: "https://www.instagram.com/p/Cabc123/",
      title: "A post",
    })).toBeNull();
  });

  it("rejects rows with no usable link", () => {
    expect(normalizeInstagramOrganicResult({ title: "金萬餐廳" })).toBeNull();
    expect(normalizeInstagramOrganicResult({ link: 42 })).toBeNull();
    expect(normalizeInstagramOrganicResult(null)).toBeNull();
    expect(normalizeInstagramOrganicResult("not an object")).toBeNull();
  });
});
