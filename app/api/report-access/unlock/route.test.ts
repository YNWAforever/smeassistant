import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  enforceCompositeIdentifierRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
  forwardEventToPostHog: vi.fn(async () => {}),
  sessionId: "anonymous-session",
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  enforceCompositeIdentifierRateLimit: mocks.enforceCompositeIdentifierRateLimit,
  rateLimitUnavailableResponse: vi.fn(() => new Response(JSON.stringify({ error: "rate_limit_unavailable" }), { status: 503 })),
  rateLimitedResponse: vi.fn(() => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 })),
}));

vi.mock("@/lib/analytics/record-event", () => ({
  parseScanEvent: (event: unknown) => event,
  forwardEventToPostHog: mocks.forwardEventToPostHog,
  resolveAnalyticsSession: () => ({ id: mocks.sessionId, created: false }),
  setAnalyticsSessionCookie: vi.fn(),
}));

import { POST as unlockPost } from "./route";
import { POST as legacyPost } from "../../unlock/route";

function request(body: Record<string, unknown>) {
  return new Request("https://smescanner.test/api/report-access/unlock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  slug: "report-1234",
  market: "hk",
  objective: "Improve local discovery",
  preferred_contact_channel: "whatsapp",
  contact_identifier: "+852 9123 4567",
  locale: "en",
  report_delivery: true,
  idempotency_key: "A".repeat(43),
};

describe("POST /api/report-access/unlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.N8N_UNLOCK_WEBHOOK_URL;
    mocks.from.mockImplementation((table: string) => {
      if (table === "audit_jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: "job-1", share_slug: "report-1234", region: "hk" },
                error: null,
              }),
            }),
          }),
        };
      }
      return { insert: vi.fn(async () => ({ error: null })) };
    });
    mocks.rpc.mockResolvedValue({
      data: [{ lead_id: "lead-1", grant_id: "grant-1", event_created: true }],
      error: null,
    });
  });

  it("never calls an outbound webhook, even when the legacy n8n URL is configured", async () => {
    // n8n/05_lead_routing.json was retired: it destructured {leadScore, routing,
    // whatsapp, businessName, overallScore, industry} while this route sent
    // {jobId, leadId, grantId, market, objective, preferredContactChannel} — only
    // jobId matched, so `routing` was undefined and every lead was stamped
    // #bd-nurture. leadScore and routing were never implemented anywhere in the
    // app. This guards against the call being reintroduced.
    process.env.N8N_UNLOCK_WEBHOOK_URL = "https://example.invalid/hook";
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    try {
      const response = await unlockPost(request({ ...validBody }));
      expect(response.status).toBe(200);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      delete process.env.N8N_UNLOCK_WEBHOOK_URL;
    }
  });
  it("rejects incomplete input before querying the database", async () => {
    const response = await unlockPost(request({ slug: "report-1234" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "market must be hk or tw" });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a safe share slug and valid optional recovery email", async () => {
    const badSlug = await unlockPost(request({ ...validBody, slug: "short" }));
    expect(badSlug.status).toBe(400);
    expect(mocks.enforceCompositeIdentifierRateLimit).not.toHaveBeenCalled();
    expect(await badSlug.json()).toEqual({ error: "slug is invalid" });

    const badEmail = await unlockPost(request({ ...validBody, recovery_email: "not-an-email" }));
    expect(badEmail.status).toBe(400);
    expect(await badEmail.json()).toEqual({ error: "recovery_email is invalid" });
  });

  it("commits through complete_report_unlock, defaults optional consents to false, and sets an opaque cookie", async () => {
    const response = await unlockPost(request({ ...validBody, recovery_email: "alternate@example.com" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      reportUrl: "/en/r/report-1234",
    });
    expect(mocks.forwardEventToPostHog).toHaveBeenCalledWith(
      { name: "report_unlocked", properties: { market: "HK", channel: "whatsapp", objective: "other" } },
      "anonymous-session",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_report_unlock",
      expect.objectContaining({
        p_job_id: "job-1",
        p_anonymous_session_id: "anonymous-session",
        p_event_properties: { market: "HK", channel: "whatsapp", objective: "other" },
        p_contact_identifier: "+85291234567",
        p_email: null,
        p_report_delivery_consent: true,
        p_scan_discussion_consent: false,
        p_marketing_consent: false,
        p_purpose: "viewer_report",
      }),
    );

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("sme_report_grant=grant-1.");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).not.toContain("job-1");
    expect(setCookie).not.toContain("+852");
  });

  it("stores the contact email only when email is the selected channel", async () => {
    const response = await unlockPost(request({
      ...validBody,
      preferred_contact_channel: "email",
      contact_identifier: "Owner@Example.com",
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_report_unlock",
      expect.objectContaining({
        p_contact_identifier: "owner@example.com",
        p_email: "owner@example.com",
        p_whatsapp: null,
      }),
    );
  });

  it("uses the report market instead of the locale-derived submitted market", async () => {
    const response = await unlockPost(request({
      ...validBody,
      market: "tw",
      locale: "zh-TW",
      preferred_contact_channel: "email",
      contact_identifier: "Owner@Example.com",
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_report_unlock",
      expect.objectContaining({
        p_contact_identifier: "owner@example.com",
        p_event_properties: { market: "HK", channel: "email", objective: "other" },
      }),
    );
  });

  it("rejects malformed consent values and never calls the unlock RPC", async () => {
    const response = await unlockPost(request({ ...validBody, marketing: "yes" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "consent values must be booleans" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects contact channels that do not belong to the report market", async () => {
    mocks.from.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { id: "job-1", share_slug: "report-1234", region: "tw" },
            error: null,
          }),
        }),
      }),
    }));
    const twWhatsapp = await unlockPost(request({
      ...validBody,
      market: "hk",
      preferred_contact_channel: "whatsapp",
    }));
    expect(twWhatsapp.status).toBe(400);
    expect(await twWhatsapp.json()).toEqual({
      error: "preferred_contact_channel is invalid for report market",
      market: "TW",
    });

    const hkLine = await unlockPost(request({
      ...validBody,
      preferred_contact_channel: "line",
      contact_identifier: "@happy_shop",
    }));
    expect(hkLine.status).toBe(400);
    expect(await hkLine.json()).toEqual({
      error: "preferred_contact_channel is invalid for report market",
      market: "HK",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
});
});

describe("report unlock analytics idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.N8N_UNLOCK_WEBHOOK_URL;
    mocks.sessionId = "11111111-1111-4111-8111-111111111111";
    mocks.from.mockImplementation((table: string) => {
      if (table === "audit_jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: "job-1", share_slug: "report-1234", region: "hk" }, error: null }),
            }),
          }),
        };
      }
      return { insert: vi.fn(async () => ({ error: null })) };
    });
  });

  it("forwards optional analytics once across idempotent retries with different sessions", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ lead_id: "lead-1", grant_id: "grant-1", event_created: true }], error: null })
      .mockResolvedValueOnce({ data: [{ lead_id: "lead-1", grant_id: "grant-1", event_created: false }], error: null });

    const first = await unlockPost(request(validBody));
    mocks.sessionId = "22222222-2222-4222-8222-222222222222";
    const retry = await unlockPost(request(validBody));

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(mocks.forwardEventToPostHog).toHaveBeenCalledTimes(1);
    expect(mocks.forwardEventToPostHog).toHaveBeenCalledWith(
      { name: "report_unlocked", properties: { market: "HK", channel: "whatsapp", objective: "other" } },
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("does not block the committed unlock when optional forwarding never settles", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ lead_id: "lead-1", grant_id: "grant-1", event_created: true }],
      error: null,
    });
    mocks.forwardEventToPostHog.mockImplementationOnce(() => new Promise(() => {}));

    const result = await Promise.race([
      unlockPost(request(validBody)),
      new Promise<"test_timeout">((resolve) => setTimeout(() => resolve("test_timeout"), 100)),
    ]);

    expect(result).not.toBe("test_timeout");
    expect((result as Response).status).toBe(200);
  });
});
describe("legacy /api/unlock compatibility", () => {
  it("redirects POST callers with a method-preserving 307", async () => {
    const response = legacyPost(
      new Request("https://smescanner.test/api/unlock", {
        method: "POST",
        body: JSON.stringify({ slug: "report-1234" }),
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://smescanner.test/api/report-access/unlock",
    );
  });
});