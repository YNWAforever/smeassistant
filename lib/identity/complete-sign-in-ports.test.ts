import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owned: vi.fn(),
  create: vi.fn(),
  attach: vi.fn(),
  job: vi.fn(),
  record: vi.fn(),
  leadEmail: vi.fn(),
  grant: vi.fn(),
  cookie: "",
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mocks.cookie }) }) }));
vi.mock("@/lib/identity/composition", () => ({ identityProvider: async () => ({ getIdentity: vi.fn(), signOut: vi.fn() }) }));
vi.mock("@/lib/repositories/membership", () => ({ membershipRepository: { ownedWorkspace: mocks.owned } }));
vi.mock("@/lib/repositories/reports", () => ({ reportsRepository: () => ({ findViewerGrant: mocks.grant }) }));
vi.mock("@/lib/repositories/claims", () => ({ claimsRepository: {
  jobBySlug: mocks.job, recordAccessRequest: mocks.record, firstLeadEmail: mocks.leadEmail,
  createWorkspaceWithOwner: mocks.create, attachJob: mocks.attach,
} }));

import { createCompletionPorts } from "./complete-sign-in-ports";
import { createViewerToken, encodeViewerGrantCookie } from "@/lib/report-access/token";

const user = { id: "attacker", email: "attacker@example.test", verified: true };
const flow = { locale: "en" as const, claim: "shared-report", returnTo: null, method: "email" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OWNER_SELF_SERVICE_CLAIM", "true");
  mocks.owned.mockResolvedValue(null);
  mocks.job.mockResolvedValue({ id: "job", workspace_id: null });
  mocks.record.mockResolvedValue(undefined);
  mocks.leadEmail.mockResolvedValue(user.email);
  mocks.create.mockResolvedValue({ id: "attacker-workspace", slug: "attacker" });
  mocks.attach.mockResolvedValue(true);
  const token = createViewerToken();
  mocks.cookie = encodeViewerGrantCookie("grant-1", token.rawToken);
  mocks.grant.mockResolvedValue({
    id: "grant-1", job_id: "job", token_hash: token.tokenHash,
    expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null,
  });
});
afterEach(() => vi.unstubAllEnvs());

it("keeps a signed-in report recipient in verification even when the forbidden runtime flag is true", async () => {
  const ports = await createCompletionPorts(new Request("https://app.test/api/owner/sign-in/complete"));
  const destination = await ports.finishClaim(user, flow);
  expect(destination).toBe("/en/owner/onboarding?claim=shared-report&claimed=requires_verification");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.attach).not.toHaveBeenCalled();
});

it("resumes existing verified ownership without creating or reattaching a workspace", async () => {
  mocks.owned.mockResolvedValue({ workspaceId: "owned-workspace" });
  mocks.job.mockResolvedValue({ id: "job", workspace_id: "owned-workspace" });
  const ports = await createCompletionPorts(new Request("https://app.test/api/owner/sign-in/complete"));
  expect(await ports.finishClaim(user, flow)).toBe("/en/owner/onboarding?claim=shared-report&claimed=claimed");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.attach).not.toHaveBeenCalled();
});

it("does not attach a foreign-owned report to the recipient's existing workspace", async () => {
  mocks.owned.mockResolvedValue({ workspaceId: "recipient-workspace" });
  mocks.job.mockResolvedValue({ id: "job", workspace_id: "foreign-workspace" });
  const ports = await createCompletionPorts(new Request("https://app.test/api/owner/sign-in/complete"));
  expect(await ports.finishClaim(user, flow)).toBe("/en/owner/onboarding?claim=shared-report&claimed=requires_verification");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.attach).not.toHaveBeenCalled();
  expect(mocks.leadEmail).not.toHaveBeenCalled();
  expect(mocks.grant).not.toHaveBeenCalled();
});

it("does not resolve ownership when sign-in has no report claim", async () => {
  const ports = await createCompletionPorts(new Request("https://app.test/api/owner/sign-in/complete"));
  expect(await ports.finishClaim(user, { ...flow, claim: null })).toBeNull();
  expect(mocks.owned).not.toHaveBeenCalled();
  expect(mocks.job).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.attach).not.toHaveBeenCalled();
});
