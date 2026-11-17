import { describe, expect, it, vi } from "vitest";

import {
  INSTAGRAM_CAPTION_MAX_CHARS,
  INSTAGRAM_PUBLISHABLE_TEMPLATES,
  instagramPublishEligibility,
  isPublicHttpsImageUrl,
} from "./instagram-eligibility";

const base = {
  enabled: true,
  templateKey: "social-post",
  approvalState: "approved",
  caption: "Fresh from the kitchen today.",
  imageUrl: "https://cdn.example.com/posts/today.jpg",
};

describe("instagramPublishEligibility", () => {
  it("allows an approved feed-post version with a public image", () => {
    expect(instagramPublishEligibility(base)).toEqual({ ok: true });
    for (const templateKey of INSTAGRAM_PUBLISHABLE_TEMPLATES) {
      expect(instagramPublishEligibility({ ...base, templateKey })).toEqual({ ok: true });
    }
  });

  it("is off unless the publish flag is on", () => {
    expect(instagramPublishEligibility({ ...base, enabled: false })).toEqual({ ok: false, reason: "flag_off" });
  });

  it("refuses templates that are not feed posts", () => {
    // ig-bio and review-response are not a caption; publishing either would
    // put the wrong content under an approved version's label.
    for (const templateKey of ["ig-bio", "ig-highlights", "review-response", "unknown"]) {
      expect(instagramPublishEligibility({ ...base, templateKey })).toEqual({ ok: false, reason: "not_publishable_template" });
    }
  });

  it("refuses a version that is no longer the approved current version", () => {
    for (const approvalState of ["draft", "changes_requested", "rejected"]) {
      expect(instagramPublishEligibility({ ...base, approvalState })).toEqual({ ok: false, reason: "not_approved" });
    }
  });

  it("refuses image URLs Meta cannot be trusted to fetch", () => {
    for (const imageUrl of [
      "http://cdn.example.com/a.jpg",
      "https://localhost/a.jpg",
      "https://127.0.0.1/a.jpg",
      "https://192.168.1.10/a.jpg",
      "https://user:pass@cdn.example.com/a.jpg",
      "not-a-url",
      "",
    ]) {
      expect(instagramPublishEligibility({ ...base, imageUrl })).toEqual({ ok: false, reason: "invalid_image_url" });
    }
  });

  it("refuses an empty or oversized caption using the owner-visible character count", () => {
    expect(instagramPublishEligibility({ ...base, caption: "   " })).toEqual({ ok: false, reason: "empty_caption" });
    expect(instagramPublishEligibility({ ...base, caption: "a".repeat(INSTAGRAM_CAPTION_MAX_CHARS + 1) })).toEqual({ ok: false, reason: "caption_too_long" });
    // Emoji count as one character, matching the platform's limit.
    expect(instagramPublishEligibility({ ...base, caption: "😀".repeat(INSTAGRAM_CAPTION_MAX_CHARS) })).toEqual({ ok: true });
  });
});

describe("isPublicHttpsImageUrl", () => {
  it("accepts an ordinary public HTTPS URL and refuses private or credentialed ones", () => {
    expect(isPublicHttpsImageUrl("https://cdn.example.com/a.jpg?x=1")).toBe(true);
    expect(isPublicHttpsImageUrl("http://cdn.example.com/a.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://10.1.2.3/a.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://172.20.0.1/a.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://example.com/" + "a".repeat(2048))).toBe(false);
  });

  it("never throws on malformed input", () => {
    expect(isPublicHttpsImageUrl("https://")).toBe(false);
    expect(isPublicHttpsImageUrl("")).toBe(false);
    expect(vi.isMockFunction(isPublicHttpsImageUrl)).toBe(false);
  });
});
