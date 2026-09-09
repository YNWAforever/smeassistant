import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(async () => ({ error: null })),
  from: vi.fn(),
  enforceCompositeIdentifierRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
}));

vi.mock("@/lib/identity/neon", () => ({
  getNeonAuth: () => ({ signIn: { magicLink: mocks.signInWithOtp } }),
}));

vi.mock("@/lib/repositories/claims", () => ({ claimsRepository: { isLeadRecipient: mocks.from } }));

vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...actual, enforceCompositeIdentifierRateLimit: mocks.enforceCompositeIdentifierRateLimit };
});

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("https://scanner.test/api/owner/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function wireRepositories(options: { job?: { id: string } | null; knownLead?: boolean } = {}) {
 const { job = {id:"job-1"}, knownLead = false } = options;
 mocks.from.mockResolvedValue(Boolean(job && knownLead));
}

describe("POST /api/owner/magic-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://configured.fimmick.com";
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.enforceCompositeIdentifierRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
    wireRepositories();
  });

  it("does not mail an address that is not already a lead on the named report", async () => {
    wireRepositories({ job: { id: "job-1" }, knownLead: false });
    const response = await POST(request({ slug: "abcdef", email: "stranger@example.com" }));

    // The open-mailer guard: the route answers ok either way so it cannot be
    // used to enumerate leads, but it must not actually send.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("mails a magic link to an address already recorded as a lead on the report", async () => {
    wireRepositories({ job: { id: "job-1" }, knownLead: true });
    const response = await POST(request({ slug: "abcdef", email: "known@example.com" }));

    expect(response.status).toBe(200);
    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "known@example.com",
        callbackURL: "https://configured.fimmick.com/auth/callback?locale=zh-HK&claim=abcdef",
      }),
    );
  });

  // Local additions: the link carries the validated locale and returnTo so the
  // callback can land on a locale-prefixed page.
  it("carries a valid locale and same-origin returnTo on the link", async () => {
    wireRepositories({ job: { id: "job-1" }, knownLead: true });
    await POST(request({ slug: "abcdef", email: "known@example.com", locale: "en", returnTo: "/en/owner/select-workspace" }));

    expect(mocks.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackURL:
            "https://configured.fimmick.com/auth/callback?locale=en&claim=abcdef&returnTo=%2Fen%2Fowner%2Fselect-workspace",
      }),
    );
  });

  it("drops an unknown locale and an off-origin returnTo", async () => {
    wireRepositories({ job: { id: "job-1" }, knownLead: true });
    await POST(request({ slug: "abcdef", email: "known@example.com", locale: "fr", returnTo: "https://evil.example/" }));

    expect(mocks.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackURL: "https://configured.fimmick.com/auth/callback?locale=zh-HK&claim=abcdef",
      }),
    );
  });

  it("falls back to the request origin when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    wireRepositories({ job: { id: "job-1" }, knownLead: true });
    await POST(request({ slug: "abcdef", email: "known@example.com" }));

    expect(mocks.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackURL: "https://scanner.test/auth/callback?locale=zh-HK&claim=abcdef",
      }),
    );
  });

  it("rejects a malformed email before touching the database", async () => {
    const response = await POST(request({ slug: "abcdef", email: "not-an-email" }));
    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects a request with no slug before touching the database", async () => {
    const response = await POST(request({ email: "known@example.com" }));
    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("carries the allowlisted SDK method and drops a spoofed one", async () => {
    wireRepositories({ job: { id: "job-1" }, knownLead: true });
    await POST(request({ slug: "Ab_cd-12", email: "known@example.com", locale: "en", returnTo: "/en/owner/shop", method: "email" }));
    expect(mocks.signInWithOtp).toHaveBeenLastCalledWith(expect.objectContaining({
      callbackURL: "https://configured.fimmick.com/auth/callback?locale=en&claim=Ab_cd-12&returnTo=%2Fen%2Fowner%2Fshop&method=email",
    }));

    await POST(request({ slug: "Ab_cd-12", email: "known@example.com", method: "admin" }));
    expect(mocks.signInWithOtp).toHaveBeenLastCalledWith(expect.objectContaining({
      callbackURL: "https://configured.fimmick.com/auth/callback?locale=zh-HK&claim=Ab_cd-12",
    }));
  });
});
