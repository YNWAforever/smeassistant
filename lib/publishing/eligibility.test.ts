import { describe, expect, it } from "vitest";
import { publishEligibility } from "./eligibility";

const ok = {
  enabled: true,
  templateKey: "review-response",
  approvalState: "approved",
  placeId: "ChIJplace",
  connectionActive: true,
  body: "Thank you for visiting.",
};

describe("publishEligibility", () => {
  it("is ok when every condition holds", () => {
    expect(publishEligibility(ok)).toEqual({ ok: true });
  });

  it("flag_off first, even when every other check also fails", () => {
    expect(publishEligibility({
      enabled: false, templateKey: "social-post", approvalState: "draft",
      placeId: null, connectionActive: false, body: "",
    })).toEqual({ ok: false, reason: "flag_off" });
  });

  it("not_review_response second", () => {
    expect(publishEligibility({
      ...ok, templateKey: "social-post", approvalState: "draft", placeId: null, connectionActive: false, body: "",
    })).toEqual({ ok: false, reason: "not_review_response" });
  });

  it("not_approved third", () => {
    expect(publishEligibility({
      ...ok, approvalState: "draft", placeId: null, connectionActive: false, body: "",
    })).toEqual({ ok: false, reason: "not_approved" });
    expect(publishEligibility({ ...ok, approvalState: "superseded" }))
      .toEqual({ ok: false, reason: "not_approved" });
  });

  it("no_location_listing fourth, for a null or empty place id", () => {
    expect(publishEligibility({ ...ok, placeId: null, connectionActive: false, body: "" }))
      .toEqual({ ok: false, reason: "no_location_listing" });
    expect(publishEligibility({ ...ok, placeId: "" }))
      .toEqual({ ok: false, reason: "no_location_listing" });
  });

  it("connection_missing fifth", () => {
    expect(publishEligibility({ ...ok, connectionActive: false, body: "" }))
      .toEqual({ ok: false, reason: "connection_missing" });
  });

  it("too_long sixth", () => {
    expect(publishEligibility({ ...ok, body: " ".repeat(5000) }))
      .toEqual({ ok: false, reason: "too_long" });
  });

  it("empty_body seventh", () => {
    expect(publishEligibility({ ...ok, body: "" }))
      .toEqual({ ok: false, reason: "empty_body" });
  });

  it("too_long at 4097 bytes, ok at 4096", () => {
    expect(publishEligibility({ ...ok, body: "a".repeat(4097) }))
      .toEqual({ ok: false, reason: "too_long" });
    expect(publishEligibility({ ...ok, body: "a".repeat(4096) })).toEqual({ ok: true });
  });

  it("1365 CJK characters (4095 bytes) ok; 1366 (4098 bytes) too_long", () => {
    const cjk1365 = "謝".repeat(1365);
    const cjk1366 = "謝".repeat(1366);
    expect(Buffer.byteLength(cjk1365, "utf8")).toBe(4095);
    expect(Buffer.byteLength(cjk1366, "utf8")).toBe(4098);
    expect(publishEligibility({ ...ok, body: cjk1365 })).toEqual({ ok: true });
    expect(publishEligibility({ ...ok, body: cjk1366 })).toEqual({ ok: false, reason: "too_long" });
  });

  it("whitespace-only body is empty_body", () => {
    expect(publishEligibility({ ...ok, body: "  \n\t　 " }))
      .toEqual({ ok: false, reason: "empty_body" });
  });
});
