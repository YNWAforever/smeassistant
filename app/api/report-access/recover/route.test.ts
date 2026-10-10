import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAIL_TEMPLATES_VERSION } from "@/lib/mail/availability";

const mocks = vi.hoisted(() => ({
  findRecipientGrant: vi.fn(),
  insertRecoveryGrant: vi.fn(),
  sendGated: vi.fn(),
  recordMailAttempt: vi.fn(),
  audit: vi.fn(),
  enforceRateLimit: vi.fn(),
  enforceComposite: vi.fn(),
}));

vi.mock("@/lib/repositories/report-recovery", () => ({
  reportRecoveryRepository: {
    findRecipientGrant: mocks.findRecipientGrant,
    insertRecoveryGrant: mocks.insertRecoveryGrant,
  },
}));
vi.mock("@/lib/mail/send-gated", () => ({ sendGated: mocks.sendGated }));
vi.mock("@/lib/mail/ledger", () => ({ recordMailAttempt: mocks.recordMailAttempt }));
vi.mock("@/lib/mail/transport", () => ({ createMailTransport: () => ({ send: vi.fn() }) }));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query: vi.fn() }) }));
vi.mock("@/lib/repositories/claims", () => ({ recordClaimAuditEvent: mocks.audit }));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  enforceCompositeIdentifierRateLimit: mocks.enforceComposite,
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

const EMAIL = "Owner@Example.com";
const SLUG = "report-1234";

function request(body: unknown) {
  return new Request("https://app.example.test/api/report-access/recover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const allowed = { allowed: true, retryAfterSeconds: 0 };
let consoleError: ReturnType<typeof vi.spyOn>;

function stubOpen() {
  for (const [key, value] of Object.entries(OPEN_MAIL_ENV)) vi.stubEnv(key, value);
  vi.stubEnv("REPORT_RECOVERY_ENABLED", "true");
}

async function snapshot(res: Response) {
  return { status: res.status, body: await res.text(), headers: [...res.headers.entries()] };
}

describe("POST /api/report-access/recover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubOpen();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.enforceRateLimit.mockResolvedValue(allowed);
    mocks.enforceComposite.mockResolvedValue(allowed);
    mocks.findRecipientGrant.mockResolvedValue({ jobId: "job-1", workspaceId: "ws-1", businessName: "Kam Man House" });
    mocks.insertRecoveryGrant.mockResolvedValue({ grantId: "grant-1" });
    mocks.sendGated.mockResolvedValue({ status: "accepted_by_provider", providerMessageId: "msg-1" });
    mocks.recordMailAttempt.mockResolvedValue({ recorded: true, existing: null });
    mocks.audit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // No log line ever carries the address or a token.
    for (const call of consoleError.mock.calls) {
      const text = JSON.stringify(call);
      expect(text.toLowerCase()).not.toContain(EMAIL.toLowerCase());
      expect(text).not.toContain("recover?t=");
    }
    consoleError.mockRestore();
    vi.unstubAllEnvs();
  });

  it("is not enabled when the flag is off", async () => {
    vi.stubEnv("REPORT_RECOVERY_ENABLED", "false");
    const res = await POST(request({ slug: SLUG, email: EMAIL, locale: "en" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_enabled" });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("is not enabled when the flag is on but mail is closed", async () => {
    vi.stubEnv("APPLICATION_MAIL_APPROVED", "");
    const res = await POST(request({ slug: SLUG, email: EMAIL, locale: "en" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_enabled" });
  });

  it.each([
    ["a bad slug", { slug: "x", email: EMAIL, locale: "en" }],
    ["an email without @", { slug: SLUG, email: "owner.example.com", locale: "en" }],
    ["an over-long email", { slug: SLUG, email: `${"a".repeat(250)}@x.io`, locale: "en" }],
    ["an unsupported locale", { slug: SLUG, email: EMAIL, locale: "fr" }],
  ])("rejects %s with 400 before any limiter", async (_label, body) => {
    const res = await POST(request(body));
    expect(res.status).toBe(400);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.enforceComposite).not.toHaveBeenCalled();
  });

  it("applies the per-IP and per-email-and-slug limiters, fail-closed, with a normalised email", async () => {
    await POST(request({ slug: SLUG, email: `  ${EMAIL} `, locale: "en" }));
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "report_recovery_ip", failClosed: true }));
    expect(mocks.enforceComposite).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "report_recovery", identifier: `owner@example.com|${SLUG}`, failClosed: true }),
    );
    expect(mocks.findRecipientGrant).toHaveBeenCalledWith(SLUG, "owner@example.com");
  });

  it("answers 429 when the per-IP limiter denies", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const res = await POST(request({ slug: SLUG, email: EMAIL, locale: "en" }));
    expect(res.status).toBe(429);
    expect(mocks.findRecipientGrant).not.toHaveBeenCalled();
  });

  it("answers 429 when the per-email-and-slug limiter denies", async () => {
    mocks.enforceComposite.mockResolvedValue({ allowed: false, retryAfterSeconds: 600 });
    const res = await POST(request({ slug: SLUG, email: EMAIL, locale: "en" }));
    expect(res.status).toBe(429);
    expect(mocks.findRecipientGrant).not.toHaveBeenCalled();
  });

  it("on a match inserts one recovery row and sends one mail with the recover link", async () => {
    const res = await POST(request({ slug: SLUG, email: EMAIL, locale: "zh-TW" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.insertRecoveryGrant).toHaveBeenCalledTimes(1);
    expect(mocks.insertRecoveryGrant).toHaveBeenCalledWith("job-1", expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(mocks.sendGated).toHaveBeenCalledTimes(1);
    const message = mocks.sendGated.mock.calls[0][0].message;
    expect(message.to).toBe("owner@example.com");
    expect(message.dedupeKey).toBe("recovery:grant-1");
    expect(message.text).toContain(`https://app.example.test/zh-TW/r/${SLUG}/recover?t=`);
    expect(mocks.recordMailAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dedupeKey: "recovery:grant-1", workspaceId: "ws-1", entityType: "report_access_grant", entityId: "grant-1" }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: "report.recovery_requested", workspace_id: "ws-1", payload: { matched: true, locale: "zh-TW" } }),
    );
  });

  it("answers a non-match exactly like a match, without inserting or sending", async () => {
    const matched = await snapshot(await POST(request({ slug: SLUG, email: EMAIL, locale: "en" })));
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(allowed);
    mocks.enforceComposite.mockResolvedValue(allowed);
    mocks.findRecipientGrant.mockResolvedValue(null);
    const unmatched = await snapshot(await POST(request({ slug: SLUG, email: "stranger@example.com", locale: "en" })));
    expect(unmatched).toEqual(matched);
    expect(matched).toMatchObject({ status: 200, body: JSON.stringify({ ok: true }) });
    expect(mocks.insertRecoveryGrant).not.toHaveBeenCalled();
    expect(mocks.sendGated).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: "report.recovery_requested", workspace_id: null, payload: { matched: false, locale: "en" } }),
    );
  });

  it("still answers 200 {ok:true} when the provider fails or throws", async () => {
    mocks.sendGated.mockResolvedValue({ status: "failed", error: "provider_error" });
    let res = await POST(request({ slug: SLUG, email: EMAIL, locale: "en" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    mocks.sendGated.mockRejectedValue(new Error(`boom for ${EMAIL}`));
    res = await POST(request({ slug: SLUG, email: EMAIL, locale: "en" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("still answers 200 {ok:true} when the repository or ledger throws, logging only a category", async () => {
    mocks.findRecipientGrant.mockRejectedValue(new Error(`detail: Key (email)=(${EMAIL})`));
    let res = await POST(request({ slug: SLUG, email: EMAIL, locale: "en" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    mocks.findRecipientGrant.mockResolvedValue({ jobId: "job-1", workspaceId: null, businessName: "Kam Man House" });
    mocks.recordMailAttempt.mockRejectedValue(new Error("ledger down"));
    res = await POST(request({ slug: SLUG, email: EMAIL, locale: "en" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    for (const call of consoleError.mock.calls) {
      expect(call).toHaveLength(2);
      expect(Object.keys(call[1] as object)).toEqual(["category"]);
    }
    expect(consoleError).toHaveBeenCalled();
  });
});
