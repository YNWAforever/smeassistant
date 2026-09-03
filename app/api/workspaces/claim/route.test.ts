import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  completeWorkspaceClaim: vi.fn(),
  enforceRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
}));

vi.mock("@/lib/auth", () => ({ getUser: mocks.getUser }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from: vi.fn() }) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...original, enforceRateLimit: mocks.enforceRateLimit };
});
vi.mock("@/lib/workspace/claim", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/workspace/claim")>();
  return { ...original, completeWorkspaceClaim: mocks.completeWorkspaceClaim };
});

import { parseClaimBody, POST } from "./route";

const USER = { id: "user-1", email: "owner@example.com", verified: true };

const BODY = {
  claim_slug: "abc123",
  workspace_name: "Kam Man House",
  primary_location: { name: "Tin Hau", address: "12 Electric Road" },
  market: "hk",
  timezone: "Asia/Hong_Kong",
  locale: "zh-HK",
};

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("https://app.test/api/workspaces/claim", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/workspaces/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  });

  it("401s without a verified session, before reading the body", async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await post(BODY);
    expect(res.status).toBe(401);
    expect(mocks.completeWorkspaceClaim).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("400s invalid JSON and an invalid body without touching the limiter or the database", async () => {
    mocks.getUser.mockResolvedValue(USER);
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ ...BODY, claim_slug: "abc" })).status).toBe(400);
    expect((await post({ ...BODY, market: "jp" })).status).toBe(400);
    expect((await post({ ...BODY, primary_location: {} })).status).toBe(400);
    expect((await post({ ...BODY, timezone: "Mars/Olympus" })).status).toBe(400);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.completeWorkspaceClaim).not.toHaveBeenCalled();
  });

  it("completes the claim for the session user and returns the workspace slug and location id", async () => {
    mocks.getUser.mockResolvedValue(USER);
    mocks.completeWorkspaceClaim.mockResolvedValue({
      kind: "completed",
      workspaceId: "ws-1",
      workspaceSlug: "kam-man-house",
      locationId: "loc-1",
    });

    const res = await post(BODY);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, workspaceSlug: "kam-man-house", locationId: "loc-1" });
    expect(mocks.completeWorkspaceClaim).toHaveBeenCalledWith(expect.anything(), {
      claimSlug: "abc123",
      workspaceName: "Kam Man House",
      primaryLocation: { name: "Tin Hau", address: "12 Electric Road" },
      market: "hk",
      timezone: "Asia/Hong_Kong",
      locale: "zh-HK",
      userId: "user-1",
    }, expect.objectContaining({ buildSnapshot: expect.any(Function), deriveActions: expect.any(Function) }));
    // Rate limited per user (10/h), failing closed.
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "workspace_claim", identifiers: ["user-1"], failClosed: true }),
    );
  });

  it("maps the outcome kinds to 404 / 403 / 409", async () => {
    mocks.getUser.mockResolvedValue(USER);

    mocks.completeWorkspaceClaim.mockResolvedValue({ kind: "not_found" });
    expect((await post(BODY)).status).toBe(404);

    mocks.completeWorkspaceClaim.mockResolvedValue({ kind: "forbidden" });
    expect((await post(BODY)).status).toBe(403);

    mocks.completeWorkspaceClaim.mockResolvedValue({ kind: "not_attached" });
    const res = await post(BODY);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_attached" });
  });

  it("429s once the per-user budget is spent", async () => {
    mocks.getUser.mockResolvedValue(USER);
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });

    const res = await post(BODY);

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(mocks.completeWorkspaceClaim).not.toHaveBeenCalled();
  });

  it("503s without leaking detail when the completion throws", async () => {
    mocks.getUser.mockResolvedValue(USER);
    mocks.completeWorkspaceClaim.mockRejectedValue(new Error("job lookup failed: db.internal"));

    const res = await post(BODY);

    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/db\.internal/);
  });
});

describe("parseClaimBody", () => {
  it("accepts the camelCase spellings as aliases and defaults locale and timezone", () => {
    const parsed = parseClaimBody({
      claimSlug: "abc123",
      workspaceName: " Kam Man House ",
      primaryLocation: { name: "Tin Hau" },
      market: "TW",
    });
    expect(parsed).toEqual({
      ok: true,
      body: {
        claimSlug: "abc123",
        workspaceName: "Kam Man House",
        primaryLocation: { name: "Tin Hau", address: null },
        market: "tw",
        timezone: null,
        locale: "zh-HK",
      },
    });
  });

  it("rejects an over-long name or address", () => {
    expect(parseClaimBody({ ...BODY, workspace_name: "x".repeat(161) })).toEqual({ ok: false, error: "workspace_name is required" });
    expect(parseClaimBody({ ...BODY, primary_location: { name: "Tin Hau", address: "x".repeat(501) } })).toEqual({
      ok: false,
      error: "primary_location.address is invalid",
    });
  });
});
