import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { isWellFormedStripeSignature } from "@/lib/stripe";

/**
 * The webhook must verify the signature before it checks configuration, so an
 * unsigned or malformed probe against an unconfigured (or partially
 * configured) deployment gets 400, never the 500 "not configured" answers.
 * This file deliberately does NOT mock @/lib/stripe: it exercises the real
 * constructWebhookEvent against the real (env-driven) configuration checks.
 */
vi.mock("@/lib/repositories/billing", () => ({
  billingRepository: () => {
    throw new Error("billingRepository must not be called before signature verification");
  },
}));

import { POST } from "./route";

function webhookRequest(signature?: string) {
  const headers: Record<string, string> = {};
  if (signature !== undefined) headers["stripe-signature"] = signature;
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers,
  });
}

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/stripe (unconfigured)", () => {
  it("returns 400 when the stripe-signature header is missing", async () => {
    const res = await POST(webhookRequest());
    expect(res.status).toBe(400);
  });

  it('returns 400 for a header that is not signature-shaped ("bad")', async () => {
    const res = await POST(webhookRequest("bad"));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a header with a timestamp but no v1 ("t=123")', async () => {
    const res = await POST(webhookRequest("t=123"));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a header with a non-hex v1 ("t=123,v1=zz")', async () => {
    const res = await POST(webhookRequest("t=123,v1=zz"));
    expect(res.status).toBe(400);
  });

  it('returns 500 STRIPE_WEBHOOK_SECRET-not-configured for a well-formed but unverifiable header ("t=1,v1=abc123")', async () => {
    const res = await POST(webhookRequest("t=1,v1=abc123"));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "STRIPE_WEBHOOK_SECRET is not configured",
    });
  });

  describe("with STRIPE_WEBHOOK_SECRET configured but STRIPE_SECRET_KEY absent", () => {
    const secret = "whsec_real";

    beforeEach(() => {
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    });

    it("returns 400 when the header is signed with a different secret", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const header = Stripe.webhooks.generateTestHeaderString({
        payload: "{}",
        secret: "whsec_other",
      });
      const res = await POST(webhookRequest(header));
      expect(res.status).toBe(400);
      expect(consoleError).toHaveBeenCalledWith(
        "Stripe webhook signature verification failed",
        expect.any(Error),
      );
      consoleError.mockRestore();
    });

    it('returns 500 "Stripe is not configured" when the header is genuinely signed', async () => {
      const header = Stripe.webhooks.generateTestHeaderString({
        payload: "{}",
        secret,
      });
      const res = await POST(webhookRequest(header));
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({
        error: "Stripe is not configured",
      });
    });
  });
});

describe("isWellFormedStripeSignature", () => {
  it("returns false with no header", () => {
    expect(isWellFormedStripeSignature("")).toBe(false);
  });

  it('returns false for "bad"', () => {
    expect(isWellFormedStripeSignature("bad")).toBe(false);
  });

  it('returns false for "t=123" (no v1)', () => {
    expect(isWellFormedStripeSignature("t=123")).toBe(false);
  });

  it('returns false for "t=123,v1=zz" (non-hex v1)', () => {
    expect(isWellFormedStripeSignature("t=123,v1=zz")).toBe(false);
  });

  it('returns true for "t=1,v0=aa,v1=bb" (extra scheme alongside a valid v1)', () => {
    expect(isWellFormedStripeSignature("t=1,v0=aa,v1=bb")).toBe(true);
  });
});
