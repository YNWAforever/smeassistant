import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(), sendCode: vi.fn(), provider: vi.fn(), eligible: vi.fn(), lead: vi.fn(),
}));
vi.mock("@/lib/repositories/workflow", () => ({ workflowRepository: () => ({ consumeRateLimit: mocks.consume }) }));
vi.mock("@/lib/identity/neon", () => ({ getNeonAuth: () => ({ handler: () => ({ POST: mocks.provider }) }) }));
vi.mock("@/lib/identity/composition", () => ({ sendEmailCode: mocks.sendCode, sendMagicLink: vi.fn() }));
vi.mock("@/lib/repositories/membership", () => ({ membershipRepository: { hasSignInMembership: mocks.eligible } }));
vi.mock("@/lib/repositories/claims", () => ({ claimsRepository: { isLeadRecipient: mocks.lead } }));

import { POST } from "./route";

const buckets = new Map<string, { count: number; resetAt: number }>();
const context = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
function request(path: string, body: object) {
  return new Request(`https://app.test/api/auth/${path}`, {
    method: "POST", headers: { origin: "https://app.test", "content-type": "application/json", "x-forwarded-for": "192.0.2.123" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks(); buckets.clear();
  mocks.sendCode.mockResolvedValue({ error: null });
  mocks.eligible.mockResolvedValue(true); mocks.lead.mockResolvedValue(true);
  mocks.provider.mockResolvedValue(Response.json({ error: "invalid_code" }, { status: 401 }));
  // Only atomic persistence is replaced. The routes and composite limiter use their real policies.
  mocks.consume.mockImplementation(async (key: string, limit: number, seconds: number) => {
    const now = Date.now(), previous = buckets.get(key);
    const bucket = previous && previous.resetAt > now ? previous : { count: 0, resetAt: now + seconds * 1000 };
    bucket.count++; buckets.set(key, bucket);
    return { allowed: bucket.count <= limit, retry_after_seconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it.each([false, true])("allows five code requests, refuses the sixth without delivery, and retries after the real hourly window (claim=%s)", async claim => {
  const path = "email-otp/send-verification-otp";
  const body = { email: "owner@fixture.test", type: "sign-in", callbackURL: `/auth/callback?locale=en&method=email${claim ? "&claim=fixture-report" : ""}` };
  const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await POST(request(path, body), context(path));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  }
  const denied = await POST(request(path, body), context(path));
  expect(denied.status).toBe(429); expect(denied.headers.get("retry-after")).toBe("3600");
  expect(mocks.sendCode).toHaveBeenCalledTimes(5);
  clock.mockReturnValue(now + 3_600_001);
  expect((await POST(request(path, body), context(path))).status).toBe(200);
  expect(mocks.sendCode).toHaveBeenCalledTimes(6);
});

it("bounds ten verification attempts before provider dispatch and resumes only after the hourly window", async () => {
  const path = "sign-in/email-otp", body = { email: "owner@fixture.test", otp: "123456" };
  const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  for (let attempt = 0; attempt < 10; attempt++) expect((await POST(request(path, body), context(path))).status).toBe(401);
  const denied = await POST(request(path, body), context(path));
  expect(denied.status).toBe(429); expect(denied.headers.get("retry-after")).toBe("3600");
  expect(mocks.provider).toHaveBeenCalledTimes(10);
  clock.mockReturnValue(now + 3_600_001);
  expect((await POST(request(path, body), context(path))).status).toBe(401);
  expect(mocks.provider).toHaveBeenCalledTimes(11);
});

it.each(["email-otp/send-verification-otp", "sign-in/email-otp"])("fails closed for %s when limiter persistence is unavailable", async path => {
  mocks.consume.mockRejectedValue(new Error("fixture_limiter_unavailable"));
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const body = path === "sign-in/email-otp" ? { email: "owner@fixture.test", otp: "123456" }
    : { email: "owner@fixture.test", type: "sign-in", callbackURL: "/auth/callback?locale=en" };
  const response = await POST(request(path, body), context(path));
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(mocks.provider).not.toHaveBeenCalled(); expect(mocks.sendCode).not.toHaveBeenCalled();
  error.mockRestore();
});

it("refuses uninvited code delivery uniformly without granting identity or querying workspace authority", async () => {
  mocks.eligible.mockResolvedValue(false);
  const path = "email-otp/send-verification-otp";
  const response = await POST(request(path, { email: "unknown@fixture.test", type: "sign-in", callbackURL: "/auth/callback?locale=en" }), context(path));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true });
  expect(mocks.sendCode).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
});
