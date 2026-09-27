import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signUnsubscribeToken } from "@/lib/mail/unsubscribe-token";

const mocks = vi.hoisted(() => ({
  optOut: vi.fn(),
  getPool: vi.fn(() => ({})),
  enforceRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
}));

vi.mock("@/lib/db/client", () => ({ getPool: mocks.getPool }));
vi.mock("@/lib/repositories/mail-outbox", () => ({ mailOutboxRepository: () => ({ optOut: mocks.optOut }) }));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  rateLimitedResponse: (retryAfterSeconds: number) =>
    new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
    }),
}));

import { GET, POST } from "./route";

const SECRET = "s".repeat(32);

function tokenFor(
  overrides: Partial<{ userId: string; workspaceId: string; kind: "rescan_complete" | "regression_alert"; expiresAt: number }> = {},
  secret = SECRET,
) {
  return signUnsubscribeToken(
    {
      userId: overrides.userId ?? "user-1",
      workspaceId: overrides.workspaceId ?? "workspace-1",
      kind: overrides.kind ?? "rescan_complete",
      expiresAt: overrides.expiresAt ?? Date.now() + 60_000,
    },
    secret,
  );
}

function postWithBody(token: string) {
  return new Request("http://localhost/api/mail/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

function postWithQuery(token: string, init: RequestInit = {}) {
  return new Request(`http://localhost/api/mail/unsubscribe?token=${encodeURIComponent(token)}`, {
    method: "POST",
    ...init,
  });
}

describe("POST /api/mail/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MAIL_UNSUBSCRIBE_SECRET", SECRET);
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
    mocks.optOut.mockResolvedValue({ member: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opts out on a valid token and calls optOut exactly once, with the payload's ids", async () => {
    const token = tokenFor();
    const response = await POST(postWithBody(token));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.optOut).toHaveBeenCalledTimes(1);
    expect(mocks.optOut).toHaveBeenCalledWith("user-1", "workspace-1", "rescan_complete");
  });

  it("is idempotent: the same token unsubscribed twice answers 200 both times", async () => {
    const token = tokenFor();
    const first = await POST(postWithBody(token));
    const second = await POST(postWithBody(token));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.optOut).toHaveBeenCalledTimes(2);
  });

  it("rejects a tampered signature without calling optOut", async () => {
    const token = tokenFor();
    const [payload, signature] = token.split(".");
    const flippedChar = signature!.at(-1) === "A" ? "B" : "A";
    const tampered = `${payload}.${signature!.slice(0, -1)}${flippedChar}`;
    const response = await POST(postWithBody(tampered));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_link" });
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("rejects an expired token without calling optOut", async () => {
    const token = tokenFor({ expiresAt: Date.now() - 1000 });
    const response = await POST(postWithBody(token));
    expect(response.status).toBe(400);
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("rejects a token signed with a different (but well-formed) secret", async () => {
    const token = tokenFor({}, "x".repeat(32));
    const response = await POST(postWithBody(token));
    expect(response.status).toBe(400);
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("answers invalid_link, not a distinct status, when the member has since left (Review Focus 5)", async () => {
    mocks.optOut.mockResolvedValue({ member: false });
    const token = tokenFor();
    const response = await POST(postWithBody(token));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_link" });
  });

  it("accepts the RFC 8058 one-click form body with the token carried in the query string", async () => {
    const token = tokenFor();
    const response = await POST(
      postWithQuery(token, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.optOut).toHaveBeenCalledTimes(1);
  });

  it("answers 503 unavailable, never a stack trace, when the secret is missing", async () => {
    vi.stubEnv("MAIL_UNSUBSCRIBE_SECRET", "");
    const token = tokenFor();
    const response = await POST(postWithBody(token));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("answers 503 unavailable when the secret is present but shorter than 32 bytes", async () => {
    vi.stubEnv("MAIL_UNSUBSCRIBE_SECRET", "too-short");
    const token = tokenFor();
    const response = await POST(postWithBody(token));
    expect(response.status).toBe(503);
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("answers 429 when the limiter denies the request, fail-open bookkeeping aside", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const token = tokenFor();
    const response = await POST(postWithBody(token));
    expect(response.status).toBe(429);
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("rejects a request with no token at all", async () => {
    const response = await POST(postWithBody(""));
    expect(response.status).toBe(400);
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("rejects GET with a cache-safe method response, never mutating anything", () => {
    const response = GET();
    expect(response.status).toBe(405);
  });
});
