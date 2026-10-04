import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { readPreviewLimits } from "./limits";

describe("readPreviewLimits", () => {
  it("defaults to 50 a day and US$2", () => {
    expect(readPreviewLimits({})).toEqual({ perIpDaily: 5, globalDaily: 50, usdDaily: 2 });
    // A blank line in an env file reads as unset, not as an invalid override.
    expect(readPreviewLimits({ PREVIEW_DRAFT_DAILY_LIMIT: "", PREVIEW_DRAFT_USD_DAILY: "" })).toEqual({ perIpDaily: 5, globalDaily: 50, usdDaily: 2 });
  });

  it("reads valid overrides", () => {
    expect(readPreviewLimits({ PREVIEW_DRAFT_DAILY_LIMIT: "120", PREVIEW_DRAFT_USD_DAILY: "0.75" })).toEqual({ perIpDaily: 5, globalDaily: 120, usdDaily: 0.75 });
    expect(readPreviewLimits({ PREVIEW_DRAFT_USD_DAILY: "3" }).usdDaily).toBe(3);
  });

  it.each(["0", "-1", "abc", "1.5", " 50", "1e3", "2147483648"])("rejects PREVIEW_DRAFT_DAILY_LIMIT=%s", (value) => {
    expect(() => readPreviewLimits({ PREVIEW_DRAFT_DAILY_LIMIT: value })).toThrow("preview_limits_invalid");
  });

  it.each(["0", "-2", "abc", "0.00", ".5", "Infinity", "1e2"])("rejects PREVIEW_DRAFT_USD_DAILY=%s", (value) => {
    expect(() => readPreviewLimits({ PREVIEW_DRAFT_USD_DAILY: value })).toThrow("preview_limits_invalid");
  });

  it("keeps the per-IP limit equal to the preview_draft rate-limit scope", () => {
    expect(RATE_LIMITS.preview_draft).toEqual({ limit: readPreviewLimits({}).perIpDaily, windowSeconds: 86400 });
  });
});
