import { describe, expect, it } from "vitest";
import { instagramCandidateFromWebsite, instagramHandleFromUrl, normalizeInstagramHandle } from "./handle";

describe("instagramHandleFromUrl", () => {
  it("reads the handle from a canonical profile URL", () => {
    expect(instagramHandleFromUrl("https://www.instagram.com/kamman.hk/")).toBe("kamman.hk");
  });

  it("accepts a bare host, http, and query strings", () => {
    expect(instagramHandleFromUrl("http://instagram.com/kamman_hk?hl=zh-hk")).toBe("kamman_hk");
  });

  it("lowercases the handle", () => {
    expect(instagramHandleFromUrl("https://instagram.com/KamMan")).toBe("kamman");
  });

  it("rejects post, reel and explore paths", () => {
    expect(instagramHandleFromUrl("https://www.instagram.com/p/Cabc123/")).toBeNull();
    expect(instagramHandleFromUrl("https://www.instagram.com/reel/Cabc123/")).toBeNull();
    expect(instagramHandleFromUrl("https://www.instagram.com/explore/tags/hkfood/")).toBeNull();
  });

  it("rejects a bare instagram.com with no path", () => {
    expect(instagramHandleFromUrl("https://www.instagram.com/")).toBeNull();
  });

  it("rejects look-alike hosts", () => {
    expect(instagramHandleFromUrl("https://instagram.com.evil.example/kamman")).toBeNull();
    expect(instagramHandleFromUrl("https://notinstagram.com/kamman")).toBeNull();
  });

  it("rejects non-instagram and unparseable values", () => {
    expect(instagramHandleFromUrl("https://linktr.ee/kamman")).toBeNull();
    expect(instagramHandleFromUrl("kamman")).toBeNull();
    expect(instagramHandleFromUrl("")).toBeNull();
  });
});

describe("normalizeInstagramHandle", () => {
  it("strips leading @ signs", () => {
    expect(normalizeInstagramHandle("@@kamman.hk")).toBe("kamman.hk");
  });

  it("accepts a pasted profile URL", () => {
    expect(normalizeInstagramHandle("  https://www.instagram.com/kamman.hk/  ")).toBe("kamman.hk");
  });

  it("rejects handles longer than 30 characters", () => {
    expect(normalizeInstagramHandle("a".repeat(31))).toBeNull();
    expect(normalizeInstagramHandle("a".repeat(30))).toBe("a".repeat(30));
  });

  it("rejects illegal characters, leading and trailing dots, and digit-free dots", () => {
    expect(normalizeInstagramHandle("kam man")).toBeNull();
    expect(normalizeInstagramHandle("kam/man")).toBeNull();
    expect(normalizeInstagramHandle(".kamman")).toBeNull();
    expect(normalizeInstagramHandle("kamman.")).toBeNull();
    expect(normalizeInstagramHandle("...")).toBeNull();
  });

  it("rejects reserved Instagram paths", () => {
    expect(normalizeInstagramHandle("explore")).toBeNull();
    expect(normalizeInstagramHandle("accounts")).toBeNull();
  });

  it("rejects empty and whitespace-only input", () => {
    expect(normalizeInstagramHandle("")).toBeNull();
    expect(normalizeInstagramHandle("   ")).toBeNull();
  });
});

describe("instagramCandidateFromWebsite", () => {
  it("builds a gbp_cross_referenced candidate from an Instagram website URL", () => {
    expect(instagramCandidateFromWebsite("https://www.instagram.com/kamman.hk/")).toEqual({
      id: "ig:kamman.hk",
      handle: "kamman.hk",
      profileUrl: "https://www.instagram.com/kamman.hk/",
      provenance: "gbp_cross_referenced",
    });
  });

  it("returns null for a normal website and for no website at all", () => {
    expect(instagramCandidateFromWebsite("https://kamman.com.hk")).toBeNull();
    expect(instagramCandidateFromWebsite(undefined)).toBeNull();
  });
});
