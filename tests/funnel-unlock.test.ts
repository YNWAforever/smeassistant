import { describe, expect, it } from "vitest";

import {
  buildUnlockPayload,
  defaultUnlockChannel,
  generateIdempotencyKey,
  resolveUnlockMarket,
  unlockChannels,
  validateUnlockForm,
} from "@/lib/funnel/unlock";

describe("unlock helpers", () => {
  it("offers market-valid channels", () => {
    expect(unlockChannels("hk")).toEqual(["whatsapp", "phone", "email"]);
    expect(unlockChannels("tw")).toEqual(["line", "phone", "email"]);
    expect(defaultUnlockChannel("hk")).toBe("whatsapp");
    expect(defaultUnlockChannel("tw")).toBe("line");
    expect(resolveUnlockMarket("HK", "zh-TW")).toBe("hk");
    expect(resolveUnlockMarket("tw", "en")).toBe("tw");
    expect(resolveUnlockMarket(null, "zh-TW")).toBe("tw");
    expect(resolveUnlockMarket("xx", "en")).toBe("hk");
  });

  it("generates a 32-byte base64url idempotency key", () => {
    const key = generateIdempotencyKey((bytes) => bytes.fill(255));
    expect(key).toHaveLength(43);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(key.startsWith("____")).toBe(true);
    const random = generateIdempotencyKey();
    expect(random).toHaveLength(43);
    expect(random).not.toBe(generateIdempotencyKey());
  });

  it("validates the contact for the chosen channel and the delivery consent", () => {
    const base = { channel: "whatsapp" as const, contact: "", recoveryEmail: "", reportDelivery: false, scanDiscussion: false, marketing: false };
    expect(validateUnlockForm("hk", base)).toEqual(["contact_required", "delivery_required"]);
    expect(validateUnlockForm("hk", { ...base, contact: "abc", reportDelivery: true })).toEqual(["contact_invalid"]);
    expect(validateUnlockForm("hk", { ...base, contact: "9123 4567", reportDelivery: true })).toEqual([]);
    expect(validateUnlockForm("tw", { ...base, channel: "line", contact: "@myshop", reportDelivery: true })).toEqual([]);
    expect(validateUnlockForm("tw", { ...base, channel: "email", contact: "owner@example.com", reportDelivery: true })).toEqual([]);
  });

  it("builds the upstream unlock body verbatim", () => {
    const payload = buildUnlockPayload({
      slug: "abc",
      market: "hk",
      objective: "better_visibility",
      locale: "zh-HK",
      idempotencyKey: "k".repeat(43),
      values: { channel: "email", contact: " Owner@Example.com ", recoveryEmail: "", reportDelivery: true, scanDiscussion: true, marketing: false },
    });
    expect(payload).toEqual({
      slug: "abc",
      market: "hk",
      objective: "better_visibility",
      preferred_contact_channel: "email",
      contact_identifier: "Owner@Example.com",
      recovery_email: "Owner@Example.com",
      locale: "zh-HK",
      report_delivery: true,
      scan_discussion: true,
      marketing: false,
      idempotency_key: "k".repeat(43),
    });
    const phone = buildUnlockPayload({
      slug: "abc",
      market: "tw",
      objective: "more_leads",
      locale: "zh-TW",
      idempotencyKey: "k",
      anonymousSessionId: "session",
      values: { channel: "line", contact: "@shop", recoveryEmail: "me@example.com", reportDelivery: true, scanDiscussion: false, marketing: true },
    });
    expect(phone.recovery_email).toBe("me@example.com");
    expect(phone.anonymous_session_id).toBe("session");
    expect(buildUnlockPayload({ ...{ slug: "a", market: "hk" as const, objective: "o", locale: "en", idempotencyKey: "k" }, values: { channel: "phone", contact: "91234567", recoveryEmail: "", reportDelivery: true, scanDiscussion: false, marketing: false } })).not.toHaveProperty("recovery_email");
  });
});
