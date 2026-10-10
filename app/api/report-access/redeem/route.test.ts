import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAIL_TEMPLATES_VERSION } from "@/lib/mail/availability";
import { hashViewerToken } from "@/lib/report-access/token";

const mocks = vi.hoisted(() => ({
  redeemRecoveryGrant: vi.fn(),
  audit: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/repositories/report-recovery", () => ({
  reportRecoveryRepository: { redeemRecoveryGrant: mocks.redeemRecoveryGrant },
}));
vi.mock("@/lib/repositories/claims", () => ({ recordClaimAuditEvent: mocks.audit }));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  rateLimitedResponse: () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
  rateLimitUnavailableResponse: () => new Response(JSON.stringify({ error: "rate_limit_unavailable" }), { status: 503 }),
}));

import { POST } from "./route";

const OPEN_MAIL_ENV = {
  APPLICATION_MAIL_APPROVED: MAIL_TEMPLATES_VERSION,
  RESEND_API_KEY: "re_fixture",
  REPORT_EMAIL_FROM: "notify@example.com",
  APP_ORIGIN: "https://app.example.test",
  MAIL_UNSUBSCRIBE_SECRET: "a".repeat(32),
};

const TOKEN = "recovery-token-AbC123_-xyz";

function request(body: unknown) {
  return new Request("https://app.example.test/api/report-access/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;

describe("POST /api/report-access/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const [key, value] of Object.entries(OPEN_MAIL_ENV)) vi.stubEnv(key, value);
    vi.stubEnv("REPORT_RECOVERY_ENABLED", "true");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.redeemRecoveryGrant.mockResolvedValue({ grantId: "viewer-grant-9", jobId: "job-1", slug: "real-slug-1234", workspaceId: "ws-7" });
    mocks.audit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const call of consoleError.mock.calls) {
      const text = JSON.stringify(call);
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(hashViewerToken(TOKEN));
    }
    consoleError.mockRestore();
    vi.unstubAllEnvs();
  });

  it("is not enabled when the flag is off", async () => {
    vi.stubEnv("REPORT_RECOVERY_ENABLED", "");
    const res = await POST(request({ token: TOKEN, locale: "en" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_enabled" });
    expect(mocks.redeemRecoveryGrant).not.toHaveBeenCalled();
  });

  it("is not enabled when the flag is on but mail is closed", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const res = await POST(request({ token: TOKEN, locale: "en" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_enabled" });
  });

  it.each([["missing", {}], ["empty", { token: "" }], ["too long", { token: "a".repeat(513) }], ["not a string", { token: 42 }]])(
    "rejects a %s token with 400 before the limiter",
    async (_label, body) => {
      const res = await POST(request({ ...body, locale: "en" }));
      expect(res.status).toBe(400);
      expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    },
  );

  it("applies the per-IP redeem limiter fail-closed and answers 429 on denial", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const res = await POST(request({ token: TOKEN, locale: "en" }));
    expect(res.status).toBe(429);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "report_redeem", failClosed: true }));
    expect(mocks.redeemRecoveryGrant).not.toHaveBeenCalled();
  });

  it("answers 410 link_expired with no cookie for an unknown, used or expired token", async () => {
    mocks.redeemRecoveryGrant.mockResolvedValue(null);
    const res = await POST(request({ token: TOKEN, locale: "en" }));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "link_expired" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("redeems by token hash, sets the new viewer grant cookie and builds the URL from the repository slug", async () => {
    const res = await POST(request({ token: TOKEN, locale: "zh-TW", slug: "attacker-slug" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reportUrl: "/zh-TW/r/real-slug-1234" });

    const [presentedHash, viewer] = mocks.redeemRecoveryGrant.mock.calls[0];
    expect(presentedHash).toBe(hashViewerToken(TOKEN));
    expect(viewer.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(viewer.tokenHash).not.toBe(presentedHash);
    expect(viewer.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const cookie = res.headers.get("set-cookie") ?? "";
    const match = /sme_report_grant=viewer-grant-9\.([A-Za-z0-9_-]{43})/.exec(cookie);
    expect(match).not.toBeNull();
    // The cookie carries the NEW raw viewer token -- the one whose hash was persisted -- never the mailed token.
    expect(hashViewerToken(match![1])).toBe(viewer.tokenHash);
    expect(cookie).not.toContain(TOKEN);

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: "report.recovery_redeemed", workspace_id: "ws-7", entity_id: "viewer-grant-9", payload: { job_id: "job-1" } }),
    );
  });

  it("audits with a null workspace id when the report belongs to no workspace", async () => {
    mocks.redeemRecoveryGrant.mockResolvedValue({ grantId: "viewer-grant-9", jobId: "job-1", slug: "real-slug-1234", workspaceId: null });
    expect((await POST(request({ token: TOKEN, locale: "en" }))).status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ event: "report.recovery_redeemed", workspace_id: null }));
  });

  it("falls back to zh-HK for an unsupported locale", async () => {
    const res = await POST(request({ token: TOKEN, locale: "fr" }));
    expect(await res.json()).toEqual({ reportUrl: "/zh-HK/r/real-slug-1234" });
  });

  it("answers 503 unavailable when the repository throws, logging only a category", async () => {
    mocks.redeemRecoveryGrant.mockRejectedValue(new Error(`Key (token_hash)=(${hashViewerToken(TOKEN)})`));
    const res = await POST(request({ token: TOKEN, locale: "en" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(Object.keys(consoleError.mock.calls[0][1] as object)).toEqual(["category"]);
  });
});
