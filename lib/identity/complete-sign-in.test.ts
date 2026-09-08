import { describe, expect, it, vi } from "vitest";

import type { CompletionPorts } from "./complete-sign-in";
import { completeSignIn } from "./complete-sign-in";
import type { AuthFlow } from "./sign-in-flow";

const flow: AuthFlow = { locale: "en", claim: null, returnTo: "/en/owner/shops?tab=overview", method: "google" };
const identity = { provider: "neon" as const, subject: "provider-subject", email: "owner@example.test", verified: true as const };
const user = { id: "user-1", email: "owner@example.test", verified: true };

function ports(overrides: Partial<CompletionPorts> = {}): CompletionPorts {
  return {
    getIdentity: vi.fn().mockResolvedValue(identity),
    mapIdentity: vi.fn().mockResolvedValue(user),
    bindInvitations: vi.fn().mockResolvedValue(undefined),
    hasAcceptedMembership: vi.fn().mockResolvedValue(true),
    finishClaim: vi.fn().mockResolvedValue("/en/owner/onboarding?claim=abcdef"),
    clearInvalidSession: vi.fn().mockResolvedValue(undefined),
    reportFailure: vi.fn(),
    ...overrides,
  };
}

describe("completeSignIn", () => {
  it("finishes a returning accepted member at a validated original destination", async () => {
    const subject = ports();
    await expect(completeSignIn(flow, subject)).resolves.toEqual({ kind: "redirect", destination: "/en/owner/shops?tab=overview" });
    expect(subject.bindInvitations).toHaveBeenCalledWith(user);
    expect(subject.hasAcceptedMembership).toHaveBeenCalledWith("user-1");
  });

  it("clears an absent session and returns invalid_session", async () => {
    const subject = ports({ getIdentity: vi.fn().mockResolvedValue(null) });
    await expect(completeSignIn(flow, subject)).resolves.toMatchObject({ kind: "recover", reason: "invalid_session" });
    expect(subject.clearInvalidSession).toHaveBeenCalledOnce();
    expect(subject.mapIdentity).not.toHaveBeenCalled();
  });

  it("clears an unverified mapped identity without exposing identity fields", async () => {
    const subject = ports({ mapIdentity: vi.fn().mockResolvedValue({ ...user, verified: false }) });
    const result = await completeSignIn(flow, subject);
    expect(result).toMatchObject({ kind: "recover", reason: "invalid_session" });
    expect(JSON.stringify(result)).not.toContain("owner@example.test");
  });

  it.each([
    ["provider outage", { getIdentity: vi.fn().mockRejectedValue(new Error("provider down")) }, "fresh_session"],
    ["mapping error", { mapIdentity: vi.fn().mockRejectedValue(new Error("mapping down")) }, "identity_mapping"],
    ["binding error", { bindInvitations: vi.fn().mockRejectedValue(new Error("binding down")) }, "invitation_binding"],
    ["membership query failure", { hasAcceptedMembership: vi.fn().mockRejectedValue(new Error("db down")) }, "workspace_lookup"],
  ] as const)("returns unavailable on %s", async (_name, override, stage) => {
    const subject = ports(override);
    const result = await completeSignIn(flow, subject);
    expect(result).toMatchObject({ kind: "recover", reason: "unavailable" });
    expect(subject.reportFailure).toHaveBeenCalledWith(stage, expect.any(String));
    expect(JSON.stringify(result)).not.toContain("owner@example.test");
  });

  it("returns no_access only after an authoritative accepted-membership lookup", async () => {
    const subject = ports({ hasAcceptedMembership: vi.fn().mockResolvedValue(false) });
    await expect(completeSignIn(flow, subject)).resolves.toEqual({ kind: "no_access" });
    expect(subject.reportFailure).not.toHaveBeenCalled();
  });

  it("completes a validated claim before membership lookup", async () => {
    const subject = ports({ finishClaim: vi.fn().mockResolvedValue("/en/owner/onboarding?claim=abcdef") });
    await expect(completeSignIn({ ...flow, claim: "abcdef" }, subject)).resolves.toEqual({ kind: "redirect", destination: "/en/owner/onboarding?claim=abcdef" });
    expect(subject.hasAcceptedMembership).not.toHaveBeenCalled();
  });

  it("returns unavailable on a claim failure rather than no_access", async () => {
    const subject = ports({ finishClaim: vi.fn().mockResolvedValue(null) });
    await expect(completeSignIn({ ...flow, claim: "abcdef" }, subject)).resolves.toMatchObject({ kind: "recover", reason: "unavailable" });
    expect(subject.reportFailure).toHaveBeenCalledWith("claim_resolution", expect.any(String));
  });
});
