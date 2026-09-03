import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn(async () => ({ error: null }));
const from = vi.fn();
const rateLimit = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithOtp } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from }) }));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceCompositeIdentifierRateLimit: () => rateLimit(),
  rateLimitUnavailableResponse: () => new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }),
  rateLimitedResponse: () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
}));

const original = process.env.NEXT_PUBLIC_SITE_URL;

function post(body: unknown) {
  return import("./route").then(({ POST }) =>
    POST(new Request("https://app.test/api/workspace-invites/magic-link", { method: "POST", body: JSON.stringify(body) })),
  );
}

function pendingRow(exists: boolean) {
  return {
    select: () => ({
      eq: () => ({
        is: () => ({ limit: async () => ({ data: exists ? [{ id: "member-1" }] : [], error: null }) }),
      }),
    }),
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
  rateLimit.mockResolvedValue({ allowed: true, unavailable: false });
});

afterEach(() => {
  vi.resetAllMocks();
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe("POST /api/workspace-invites/magic-link", () => {
  it("mails an OTP when a pending invite exists for the email", async () => {
    from.mockReturnValue(pendingRow(true));

    const res = await post({ email: "invited@example.com" });

    expect(res.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "invited@example.com",
        options: expect.objectContaining({
          emailRedirectTo: "https://app.example.com/auth/callback?locale=zh-HK",
        }),
      }),
    );
  });

  // Local additions: locale and returnTo travel on the link; the origin falls
  // back to the request when NEXT_PUBLIC_SITE_URL is unset.
  it("carries the validated locale and returnTo, dropping unsafe values", async () => {
    from.mockReturnValue(pendingRow(true));

    await post({ email: "invited@example.com", locale: "zh-TW", returnTo: "/zh-TW/owner/select-workspace" });
    expect(signInWithOtp).toHaveBeenLastCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "https://app.example.com/auth/callback?locale=zh-TW&returnTo=%2Fzh-TW%2Fowner%2Fselect-workspace",
        }),
      }),
    );

    await post({ email: "invited@example.com", locale: "xx", returnTo: "//evil.example" });
    expect(signInWithOtp).toHaveBeenLastCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ emailRedirectTo: "https://app.example.com/auth/callback?locale=zh-HK" }),
      }),
    );
  });

  it("uses the request origin when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    from.mockReturnValue(pendingRow(true));

    await post({ email: "invited@example.com" });
    expect(signInWithOtp).toHaveBeenLastCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ emailRedirectTo: "https://app.test/auth/callback?locale=zh-HK" }),
      }),
    );
  });

  it("returns ok without mailing when no pending invite exists, to avoid enumeration", async () => {
    from.mockReturnValue(pendingRow(false));

    const res = await post({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const res = await post({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("is rate limited per email", async () => {
    rateLimit.mockResolvedValue({ allowed: false, unavailable: false, retryAfterSeconds: 30 });

    const res = await post({ email: "invited@example.com" });
    expect(res.status).toBe(429);
  });
});
