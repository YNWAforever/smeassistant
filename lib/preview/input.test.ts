import { describe, expect, it } from "vitest";
import { parsePreviewInput } from "./input";

const review = "The goose was cold";

describe("parsePreviewInput", () => {
  it("accepts a 10-code-point review after trim and an optional 1–5 rating", () => {
    expect(parsePreviewInput({ review: "  0123456789  ", locale: "en" })).toEqual({ ok: true, review: "0123456789", rating: null, locale: "en" });
    for (const rating of [1, 2, 3, 4, 5] as const) {
      expect(parsePreviewInput({ review, rating, locale: "zh-HK" })).toEqual({ ok: true, review, rating, locale: "zh-HK" });
    }
    expect(parsePreviewInput({ review, locale: "zh-TW" })).toEqual({ ok: true, review, rating: null, locale: "zh-TW" });
  });

  it("rejects whitespace-only, 9 code points and 1,501 code points", () => {
    expect(parsePreviewInput({ review: "   \n\t  ", locale: "en" })).toEqual({ ok: false });
    expect(parsePreviewInput({ review: "  012345678  ", locale: "en" })).toEqual({ ok: false });
    expect(parsePreviewInput({ review: "a".repeat(1501), locale: "en" })).toEqual({ ok: false });
    expect(parsePreviewInput({ review: "a".repeat(1500), locale: "en" })).toMatchObject({ ok: true });
    // 9 emoji are 18 UTF-16 units but only 9 code points.
    expect(parsePreviewInput({ review: "😀".repeat(9), locale: "en" })).toEqual({ ok: false });
  });

  it("accepts 1,500 emoji (counted as code points, not UTF-16 units)", () => {
    const emoji = "😀".repeat(1500);
    expect(emoji.length).toBe(3000);
    expect(parsePreviewInput({ review: emoji, locale: "en" })).toEqual({ ok: true, review: emoji, rating: null, locale: "en" });
    expect(parsePreviewInput({ review: "😀".repeat(1501), locale: "en" })).toEqual({ ok: false });
  });

  it.each([0, 6, 2.5, "5", null, Number.NaN, true])("rejects rating %j", (rating) => {
    expect(parsePreviewInput({ review, rating, locale: "en" })).toEqual({ ok: false });
  });

  it("rejects an unsupported locale and a non-object body", () => {
    expect(parsePreviewInput({ review, locale: "fr" })).toEqual({ ok: false });
    expect(parsePreviewInput({ review })).toEqual({ ok: false });
    expect(parsePreviewInput({ review: 1234567890, locale: "en" })).toEqual({ ok: false });
    for (const body of [null, undefined, "review", 42, [review]]) {
      expect(parsePreviewInput(body)).toEqual({ ok: false });
    }
  });
});
