import { expect, it } from "vitest";
import { actionListFingerprint, actionPageSize, decodeActionCursor, encodeActionCursor } from "./action-list-cursor";
const scope = actionListFingerprint({ workspace: "w", location: "l", view: "all" });
const key = { score: 61, updatedAt: "2026-10-01 00:00:00.123456+00", id: "00000000-0000-4000-8000-000000000001" };
it("retains the exact sort tuple and refuses another scope", () => {
  const value = encodeActionCursor(key, scope);
  expect(decodeActionCursor(value, scope)).toEqual(key);
  expect(() => decodeActionCursor(value, actionListFingerprint({ workspace: "other" }))).toThrow("invalid_action_cursor");
  expect(decodeActionCursor(undefined, scope)).toBeNull();
});
it.each(["", "bad.cursor", "a".repeat(1025), Buffer.from(JSON.stringify({ v: 1, fingerprint: scope, score: 0, updatedAt: "bad", id: key.id })).toString("base64url")])("refuses invalid cursor", (value) => {
  expect(() => decodeActionCursor(value, scope)).toThrow("invalid_action_cursor");
});
it.each(["2026-02-30T00:00:00Z", "2026-02-29T00:00:00.123456Z", "2026-04-31 00:00:00.123456+00"])("refuses an impossible cursor calendar date: %s", updatedAt => {
  expect(() => decodeActionCursor(encodeActionCursor({ ...key, updatedAt }, scope), scope)).toThrow("invalid_action_cursor");
});
it.each(["2024-02-29T00:00:00.123456Z", "2024-02-29 00:00:00.654321+00"])("preserves the exact leap-day microseconds: %s", updatedAt => {
  expect(decodeActionCursor(encodeActionCursor({ ...key, updatedAt }, scope), scope)).toEqual({ ...key, updatedAt });
});
it("defaults to 25 and accepts the upper bound of 50", () => { expect(actionPageSize()).toBe(25); expect(actionPageSize(50)).toBe(50); });
it.each([0, 51, -1, 1.5, "25", null, NaN])( "rejects invalid page size", (value) => { expect(() => actionPageSize(value)).toThrow("invalid_action_page_size"); });
