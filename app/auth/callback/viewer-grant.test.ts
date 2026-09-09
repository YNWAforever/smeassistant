import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { CompletionPorts } from "@/lib/identity/complete-sign-in";
import { completeSignIn } from "@/lib/identity/complete-sign-in";
import { holdsViewerGrant } from "@/lib/identity/claim-viewer-grant";
import type { AuthFlow } from "@/lib/identity/sign-in-flow";
import {
  createViewerToken,
  encodeViewerGrantCookie,
} from "@/lib/report-access/token";

const mocks = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  grant: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (mocks.cookie ? { value: mocks.cookie } : undefined),
  }),
}));
vi.mock("@/lib/repositories/reports", () => ({
  reportsRepository: () => ({ findViewerGrant: mocks.grant }),
}));

const token = createViewerToken();
const claimFlow: AuthFlow = {
  locale: "en",
  claim: "abcdef",
  returnTo: null,
  method: "google",
};

function completionPorts(
  overrides: Partial<CompletionPorts> = {},
): CompletionPorts {
  return {
    getIdentity: vi.fn().mockResolvedValue({
      provider: "neon",
      subject: "fixture-subject",
      email: "fixture@example.test",
      verified: true,
    }),
    mapIdentity: vi
      .fn()
      .mockResolvedValue({
        id: "user",
        email: "fixture@example.test",
        verified: true,
      }),
    bindInvitations: vi.fn().mockResolvedValue(undefined),
    hasAcceptedMembership: vi.fn().mockResolvedValue(true),
    finishClaim: vi.fn().mockResolvedValue("/en/owner/onboarding?claim=abcdef"),
    clearInvalidSession: vi.fn().mockResolvedValue(undefined),
    reportFailure: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookie = encodeViewerGrantCookie("grant-1", token.rawToken);
  mocks.grant.mockResolvedValue({
    id: "grant-1",
    job_id: "job-1",
    token_hash: token.tokenHash,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    revoked_at: null,
  });
});
afterEach(() => vi.unstubAllGlobals());

it("uses the existing Neon grant repository with both job and presented grant identifiers", async () => {
  await expect(holdsViewerGrant("job-1")).resolves.toBe(true);
  expect(mocks.grant).toHaveBeenCalledWith("job-1", "grant-1");
});

it.each([
  { job_id: "foreign" },
  { revoked_at: "2026-01-01" },
  { expires_at: "bad" },
  { expires_at: "2020-01-01" },
  { token_hash: "0".repeat(64) },
])("rejects invalid grant %j", async (patch) => {
  mocks.grant.mockResolvedValue({ ...(await mocks.grant()), ...patch });
  await expect(holdsViewerGrant("job-1")).resolves.toBe(false);
});

it("does not look up absent or malformed cookies", async () => {
  for (const cookie of [undefined, "broken"]) {
    mocks.cookie = cookie;
    await expect(holdsViewerGrant("job-1")).resolves.toBe(false);
  }
  expect(mocks.grant).not.toHaveBeenCalled();
});

it("fails closed on SQL errors without leaking details", async () => {
  mocks.grant.mockRejectedValue(new Error("private database details"));
  const ports = completionPorts({
    finishClaim: async () => {
      await holdsViewerGrant("job-1");
      return "/en/owner/onboarding?claim=abcdef";
    },
  });

  const result = await completeSignIn(claimFlow, ports);

  expect(result).toMatchObject({ kind: "recover", reason: "unavailable" });
  expect(ports.reportFailure).toHaveBeenCalledWith(
    "claim_resolution",
    expect.any(String),
  );
  expect(JSON.stringify(result)).not.toContain("private database details");
});
