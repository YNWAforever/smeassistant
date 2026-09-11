import { describe, expect, it } from "vitest";
import {
  ASSISTED_DECISIONS,
  decisionEvent,
  decisionIsTerminal,
  decisionIdempotencyKey,
  parseVerification,
  type AssistedDecision,
} from "./assisted-assignment";

describe("decision vocabulary", () => {
  it("lists exactly the three outcomes", () => {
    expect([...ASSISTED_DECISIONS].sort()).toEqual(["approved", "needs_information", "rejected"]);
  });

  it.each([
    ["approved", true],
    ["rejected", true],
    ["needs_information", false],
  ] as Array<[AssistedDecision, boolean]>)("%s terminality is %s", (decision, terminal) => {
    expect(decisionIsTerminal(decision)).toBe(terminal);
  });

  it("maps each decision to its audit event name", () => {
    expect(decisionEvent("approved")).toBe("access_request.approved");
    expect(decisionEvent("rejected")).toBe("access_request.rejected");
    expect(decisionEvent("needs_information")).toBe("access_request.information_requested");
  });
});

describe("decisionIdempotencyKey", () => {
  // One key for either terminal outcome: at most one terminal decision per
  // request can ever exist, so approving after rejecting collides and loses.
  it("is the same key for approved and rejected", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(decisionIdempotencyKey(id, "approved")).toBe(`access_request:${id}:decision`);
    expect(decisionIdempotencyKey(id, "rejected")).toBe(decisionIdempotencyKey(id, "approved"));
  });

  it("is null for a non-terminal decision, so it can be repeated", () => {
    expect(decisionIdempotencyKey("33333333-3333-4333-8333-333333333333", "needs_information")).toBeNull();
  });

  it("is globally unique, because the index is table-wide", () => {
    expect(decisionIdempotencyKey("a", "approved")).not.toBe(decisionIdempotencyKey("b", "approved"));
  });
});

describe("parseVerification", () => {
  it("accepts what the operator actually checked", () => {
    expect(parseVerification({ method: " Business registration BR12345678 ", verified_by: " Ada Wong " }))
      .toEqual({ method: "Business registration BR12345678", verified_by: "Ada Wong" });
  });

  it.each([
    ["missing method", { verified_by: "Ada Wong" }],
    ["blank method", { method: "   ", verified_by: "Ada Wong" }],
    ["missing verifier", { method: "BR12345678" }],
    ["blank verifier", { method: "BR12345678", verified_by: "" }],
    ["not an object", "BR12345678"],
    ["null", null],
  ])("rejects %s", (_label, input) => {
    expect(parseVerification(input)).toBeNull();
  });

  it("bounds each field so one request cannot write an essay into the ledger", () => {
    expect(parseVerification({ method: "x".repeat(501), verified_by: "Ada" })).toBeNull();
    expect(parseVerification({ method: "x".repeat(500), verified_by: "Ada" })).not.toBeNull();
  });
});
