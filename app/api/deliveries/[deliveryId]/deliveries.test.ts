import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTION_ID,
  LOCATION_ID,
  VERSION_ID,
  WORKSPACE_ID,
  authorizeLike,
} from "@/app/api/actions/_shared/test-db";

const TOKEN = "ya29.fixed-access-token-PLAINTEXT";
const DELIVERY_ID = "66666666-6666-4666-8666-666666666666";
const REVIEW_NAME = "accounts/1/locations/2/reviews/r1";
const REVIEW_TEXT = "The noodles were cold and the waiter ignored us";
const REVIEWER = "Chan Tai Man";
const BODY = "Thank you for visiting, and sorry about the café service.\nWe hope to welcome you back.";
const OTHER_REPLY = "A reply someone else wrote on Google";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  consumePublishLimits: vi.fn(),
  getUsage: vi.fn(),
  sendDeliveryNotices: vi.fn(),
  workspaces: vi.fn(),
  repoFactory: vi.fn(),
  withToken: vi.fn(),
  repo: {
    getDelivery: vi.fn(),
    finish: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/publishing", async (original) => ({
  ...(await original<typeof import("@/lib/repositories/publishing")>()),
  publishingRepository: (...args: unknown[]) => {
    mocks.repoFactory(...args);
    return mocks.repo;
  },
}));
vi.mock("@/lib/publishing/connection", async (original) => ({
  ...(await original<typeof import("@/lib/publishing/connection")>()),
  withGbpAccessToken: (...args: unknown[]) => mocks.withToken(...args),
}));
vi.mock("@/lib/publishing/limits", () => ({
  consumePublishLimits: (...args: unknown[]) => mocks.consumePublishLimits(...args),
}));
vi.mock("@/lib/workspace/usage", async (original) => ({
  ...(await original<typeof import("@/lib/workspace/usage")>()),
  getUsage: (...args: unknown[]) => mocks.getUsage(...args),
}));
vi.mock("@/lib/repositories/workspace-read", () => ({
  workspaceReadRepository: () => ({ workspaces: (...args: unknown[]) => mocks.workspaces(...args) }),
}));
vi.mock("@/lib/workspace/delivery-notices", () => ({
  sendDeliveryNotices: (...args: unknown[]) => mocks.sendDeliveryNotices(...args),
}));

import { GbpError } from "@/lib/oauth/google-reviews";
import { GbpConnectionError } from "@/lib/publishing/connection";
import { RECONCILE_AFTER_MS } from "@/lib/publishing/timing";
import { reconcileDelivery } from "@/lib/publishing/reconcile";
import { PublishError, type PublishDelivery } from "@/lib/repositories/publishing";

const unauthorized = (e: unknown) => e instanceof GbpError && e.code === "unauthorized";

/** The real helper's contract with a fixed token: one retry on unauthorized, expiry on a second. */
async function passThrough<T>(_workspaceId: string, fn: (token: string) => Promise<T>): Promise<T> {
  try {
    return await fn(TOKEN);
  } catch (error) {
    if (!unauthorized(error)) throw error;
  }
  try {
    return await fn(TOKEN);
  } catch (error) {
    if (!unauthorized(error)) throw error;
    throw new GbpConnectionError("connection_expired");
  }
}

// ---------------------------------------------------------------------------
// A fake Google holding one review and its reply. Per-call overrides are
// queued; every request is recorded.

type Step = { status?: number; throws?: "timeout" | "network" };
type Call = { method: string; url: string };

class FakeGoogle {
  reply: string | null = null;
  /** Google answers a review without a reply with an empty comment sometimes. */
  emptyReply = false;
  replyTime = "2026-10-04T09:00:00Z";
  gets: Step[] = [];
  deletes: Step[] = [];
  calls: Call[] = [];

  get methods(): string[] {
    return this.calls.map((c) => c.method);
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    this.calls.push({ method, url });
    const path = new URL(url).pathname;
    if (method === "GET" && path === `/v4/${REVIEW_NAME}`) {
      const step = this.gets.shift();
      return this.answer(step, {
        name: REVIEW_NAME,
        reviewer: { displayName: REVIEWER },
        comment: REVIEW_TEXT,
        ...(this.reply !== null
          ? { reviewReply: { comment: this.reply, updateTime: this.replyTime } }
          : this.emptyReply
            ? { reviewReply: { comment: "" } }
            : {}),
      });
    }
    if (method === "DELETE" && path === `/v4/${REVIEW_NAME}/reply`) {
      const step = this.deletes.shift();
      if (!step?.throws && (step?.status ?? 200) < 300) this.reply = null;
      return this.answer(step, {});
    }
    return new Response("{}", { status: 404 });
  };

  private answer(step: Step | undefined, fallback: unknown): Response {
    if (step?.throws === "timeout") throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    if (step?.throws === "network") throw new TypeError("fetch failed");
    const status = step?.status ?? 200;
    return new Response(JSON.stringify(status >= 300 ? { error: { message: `echo ${TOKEN} ${REVIEW_TEXT}` } } : fallback), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
}

let google: FakeGoogle;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const delivery = (over: Partial<PublishDelivery> = {}): PublishDelivery => ({
  id: DELIVERY_ID,
  workspaceId: WORKSPACE_ID,
  versionId: VERSION_ID,
  actionId: ACTION_ID,
  locationId: LOCATION_ID,
  templateKey: "review-response",
  versionNo: 2,
  body: BODY,
  state: "publishing",
  targetRef: REVIEW_NAME,
  counted: false,
  failureReason: null,
  verifiedAt: null,
  createdAt: ago(120_000),
  ...over,
});

async function reconcile(deliveryId = DELIVERY_ID) {
  const { POST } = await import("./reconcile/route");
  return POST(new Request(`https://app.test/api/deliveries/${deliveryId}/reconcile`, { method: "POST" }), {
    params: Promise.resolve({ deliveryId }),
  });
}

async function deleteReplyRoute(deliveryId = DELIVERY_ID) {
  const { DELETE } = await import("./reply/route");
  return DELETE(new Request(`https://app.test/api/deliveries/${deliveryId}/reply`, { method: "DELETE" }), {
    params: Promise.resolve({ deliveryId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withToken.mockImplementation(passThrough);
  vi.stubEnv("GBP_REPLY_PUBLISH_ENABLED", "true");
  google = new FakeGoogle();
  vi.stubGlobal("fetch", google.fetch);
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [LOCATION_ID]));
  mocks.consumePublishLimits.mockResolvedValue({ allowed: true });
  mocks.getUsage.mockResolvedValue({ period: "2026-10", approvedDeliveries: 1, allowance: 3, tier: "lite" });
  mocks.workspaces.mockResolvedValue([{ id: WORKSPACE_ID, timezone: "Asia/Hong_Kong", tier: "lite" }]);
  mocks.sendDeliveryNotices.mockResolvedValue(undefined);
  mocks.repo.getDelivery.mockResolvedValue(delivery());
  mocks.repo.finish.mockImplementation(async (input: { outcome: "published" | "failed" }) => ({
    kind: "finished",
    state: input.outcome,
    counted: input.outcome === "published",
  }));
  mocks.repo.cancel.mockResolvedValue({ state: "cancelled" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/deliveries/[deliveryId]/reconcile", () => {
  it("works with the flag off", async () => {
    for (const value of ["false", ""]) {
      vi.stubEnv("GBP_REPLY_PUBLISH_ENABLED", value);
      google = new FakeGoogle();
      google.reply = BODY;
      vi.stubGlobal("fetch", google.fetch);
      const res = await reconcile();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deliveryId: DELIVERY_ID, state: "published", counted: true });
      expect(google.methods).toEqual(["GET"]);
    }
  });

  it("a malformed delivery id is 400 and an unknown delivery 404, both before authorization", async () => {
    expect((await reconcile("not-a-uuid")).status).toBe(400);
    expect(mocks.repo.getDelivery).not.toHaveBeenCalled();
    mocks.repo.getDelivery.mockResolvedValue(null);
    const res = await reconcile();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.repo.getDelivery).toHaveBeenCalledWith(DELIVERY_ID);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(google.calls).toEqual([]);
  });

  it("viewer 403; out-of-scope manager 403", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await reconcile()).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", ["elsewhere"]));
    const res = await reconcile();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith(
      { id: WORKSPACE_ID },
      { minRole: "manager", locationId: LOCATION_ID },
    );
    expect(mocks.consumePublishLimits).not.toHaveBeenCalled();
    expect(mocks.repo.finish).not.toHaveBeenCalled();
    expect(google.calls).toEqual([]);

    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    google.reply = BODY;
    expect((await reconcile()).status).toBe(200);
  });

  it("a delivery without a location authorizes workspace-wide", async () => {
    mocks.repo.getDelivery.mockResolvedValue(delivery({ locationId: null }));
    google.reply = BODY;
    await reconcile();
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "manager", locationId: undefined });
  });

  it("an unauthenticated caller gets the auth status", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    const res = await reconcile();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("a published delivery returns its state without a Google call", async () => {
    mocks.repo.getDelivery.mockResolvedValue(delivery({ state: "published", counted: true, verifiedAt: ago(1000) }));
    const res = await reconcile();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deliveryId: DELIVERY_ID, state: "published", counted: true });
    mocks.repo.getDelivery.mockResolvedValue(delivery({ state: "failed", failureReason: "provider_forbidden" }));
    expect(await (await reconcile()).json()).toEqual({ deliveryId: DELIVERY_ID, state: "failed", counted: false });
    expect(google.calls).toEqual([]);
    expect(mocks.consumePublishLimits).not.toHaveBeenCalled();
    expect(mocks.repo.finish).not.toHaveBeenCalled();
    expect(mocks.withToken).not.toHaveBeenCalled();
  });

  it("under 60 s returns too_soon without a Google call (longer than a 30 s publish request)", async () => {
    expect(RECONCILE_AFTER_MS).toBe(60_000);
    // 31 s: past the publish route's 30 s maxDuration, still inside the window.
    for (const age of [5_000, 31_000, 55_000]) {
      mocks.repo.getDelivery.mockResolvedValue(delivery({ createdAt: ago(age) }));
      const res = await reconcile();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deliveryId: DELIVERY_ID, state: "publishing", counted: false, reason: "too_soon" });
    }
    expect(google.calls).toEqual([]);
    expect(mocks.consumePublishLimits).not.toHaveBeenCalled();
    expect(mocks.repo.finish).not.toHaveBeenCalled();

    google.reply = BODY;
    mocks.repo.getDelivery.mockResolvedValue(delivery({ createdAt: ago(61_000) }));
    expect(await (await reconcile()).json()).toEqual({ deliveryId: DELIVERY_ID, state: "published", counted: true });
  });

  it("equal → published and counted once; null → not_applied; different → already_replied; not_found → review_not_found; timeout → stays publishing with provider_unavailable", async () => {
    // equal (CRLF + NFD + padding still equal)
    google.reply = `${BODY.replace(/\n/g, "\r\n").normalize("NFD")}  `;
    let res = await reconcile();
    expect(await res.json()).toEqual({ deliveryId: DELIVERY_ID, state: "published", counted: true });
    expect(mocks.consumePublishLimits).toHaveBeenCalledWith("reconcile", { workspaceId: WORKSPACE_ID, deliveryId: DELIVERY_ID });
    expect(mocks.repo.finish).toHaveBeenCalledTimes(1);
    expect(mocks.repo.finish).toHaveBeenCalledWith({
      deliveryId: DELIVERY_ID,
      actorId: "user-1",
      outcome: "published",
      receipt: { review_name: REVIEW_NAME, reply_update_time: "2026-10-04T09:00:00Z" },
      reason: null,
    });
    expect(mocks.sendDeliveryNotices).toHaveBeenCalledTimes(1);
    expect(mocks.sendDeliveryNotices).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actionId: ACTION_ID,
      kind: "publish",
      usage: { period: "2026-10", approvedDeliveries: 1, allowance: 3, tier: "lite" },
    });
    expect(google.methods).toEqual(["GET"]);

    const cases: Array<[() => void, Record<string, unknown>, boolean]> = [
      [() => { google.reply = null; }, { state: "failed", counted: false, reason: "not_applied" }, true],
      [() => { google.emptyReply = true; }, { state: "failed", counted: false, reason: "not_applied" }, true],
      [() => { google.reply = OTHER_REPLY; }, { state: "failed", counted: false, reason: "already_replied" }, true],
      [() => { google.gets.push({ status: 404 }); }, { state: "failed", counted: false, reason: "review_not_found" }, true],
      [() => { google.gets.push({ throws: "timeout" }); }, { state: "publishing", counted: false, reason: "provider_unavailable" }, false],
      [() => { google.gets.push({ throws: "network" }); }, { state: "publishing", counted: false, reason: "provider_unavailable" }, false],
      [() => { google.gets.push({ status: 500 }); }, { state: "publishing", counted: false, reason: "provider_unavailable" }, false],
      [() => { google.gets.push({ status: 403 }); }, { state: "publishing", counted: false, reason: "provider_forbidden" }, false],
      [() => { google.gets.push({ status: 429 }); }, { state: "publishing", counted: false, reason: "provider_rate_limited" }, false],
      [() => { google.gets.push({ status: 401 }, { status: 401 }); }, { state: "publishing", counted: false, reason: "connection_expired" }, false],
    ];
    for (const [arrange, expected, finishes] of cases) {
      vi.clearAllMocks();
      mocks.withToken.mockImplementation(passThrough);
      google = new FakeGoogle();
      vi.stubGlobal("fetch", google.fetch);
      arrange();
      res = await reconcile();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deliveryId: DELIVERY_ID, ...expected });
      if (finishes) {
        expect(mocks.repo.finish).toHaveBeenCalledWith(
          expect.objectContaining({ outcome: "failed", reason: expected.reason, receipt: null }),
        );
      } else {
        expect(mocks.repo.finish).not.toHaveBeenCalled();
      }
      expect(mocks.sendDeliveryNotices).not.toHaveBeenCalled();
      expect(google.calls.every((c) => c.method === "GET")).toBe(true);
    }
  });

  it("a missing connection stays publishing with connection_expired; an unreadable token is 503", async () => {
    mocks.withToken.mockRejectedValueOnce(new GbpConnectionError("connection_missing"));
    expect(await (await reconcile()).json()).toEqual({
      deliveryId: DELIVERY_ID,
      state: "publishing",
      counted: false,
      reason: "connection_expired",
    });
    mocks.withToken.mockRejectedValueOnce(new Error("token_unreadable"));
    const res = await reconcile();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(mocks.repo.finish).not.toHaveBeenCalled();
  });

  it("limiter refused 429", async () => {
    mocks.consumePublishLimits.mockResolvedValue({ allowed: false, retryAfterSeconds: 77 });
    const limited = await reconcile();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("77");
    mocks.consumePublishLimits.mockResolvedValue({ allowed: false, unavailable: true });
    expect((await reconcile()).status).toBe(503);
    expect(google.calls).toEqual([]);
    expect(mocks.repo.finish).not.toHaveBeenCalled();
  });

  it("a finish that loses a race to another reconcile reports the stored state and sends no second notice", async () => {
    google.reply = BODY;
    mocks.repo.finish.mockResolvedValue({ kind: "existing", state: "published", counted: true });
    expect(await (await reconcile()).json()).toEqual({ deliveryId: DELIVERY_ID, state: "published", counted: true });
    expect(mocks.sendDeliveryNotices).not.toHaveBeenCalled();
  });

  it("a finish that finds the delivery already failed reports the stored reason, so the card shows failure copy", async () => {
    google.reply = null;
    mocks.repo.finish.mockResolvedValue({ kind: "existing", state: "failed", counted: false });
    mocks.repo.getDelivery
      .mockResolvedValueOnce(delivery())
      .mockResolvedValueOnce(delivery({ state: "failed", failureReason: "already_replied" }));
    expect(await (await reconcile()).json()).toEqual({
      deliveryId: DELIVERY_ID,
      state: "failed",
      counted: false,
      reason: "already_replied",
    });
    expect(mocks.sendDeliveryNotices).not.toHaveBeenCalled();
  });

  it("a delivery lookup failure is 503", async () => {
    mocks.repo.getDelivery.mockRejectedValue(new Error("db down"));
    const res = await reconcile();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});

describe("reconcileDelivery", () => {
  const deps = () => ({
    repository: mocks.repo,
    fetchImpl: google.fetch as typeof fetch,
    withToken: passThrough as never,
  });

  it("finishes only a definite outcome and passes the actor through", async () => {
    google.reply = BODY;
    expect(await reconcileDelivery(delivery(), "actor-9", deps())).toMatchObject({ state: "published", counted: true });
    expect(mocks.repo.finish).toHaveBeenCalledWith(expect.objectContaining({ actorId: "actor-9", outcome: "published" }));
  });

  it("a finish that throws reports what the delivery holds now", async () => {
    google.reply = OTHER_REPLY;
    mocks.repo.finish.mockRejectedValue(new PublishError("delivery_not_publishing"));
    mocks.repo.getDelivery.mockResolvedValue(delivery({ state: "cancelled" }));
    expect(await reconcileDelivery(delivery(), "actor-9", deps())).toMatchObject({ state: "cancelled", counted: false });
  });
});

describe("DELETE /api/deliveries/[deliveryId]/reply", () => {
  beforeEach(() => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    mocks.repo.getDelivery.mockResolvedValue(delivery({ state: "published", counted: true, verifiedAt: ago(1000) }));
    google.reply = BODY;
  });

  it("flag off 404", async () => {
    for (const value of [undefined, "", "false", "TRUE"]) {
      vi.stubEnv("GBP_REPLY_PUBLISH_ENABLED", value);
      const res = await deleteReplyRoute();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_enabled" });
    }
    expect(mocks.repoFactory).not.toHaveBeenCalled();
    for (const fn of Object.values(mocks.repo)) expect(fn).not.toHaveBeenCalled();
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(google.calls).toEqual([]);
  });

  it("a malformed delivery id is 400; an unknown delivery 404", async () => {
    expect((await deleteReplyRoute("nope")).status).toBe(400);
    mocks.repo.getDelivery.mockResolvedValue(null);
    expect((await deleteReplyRoute()).status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("manager 403; owner passes", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [LOCATION_ID]));
    const refused = await deleteReplyRoute();
    expect(refused.status).toBe(403);
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith(
      { id: WORKSPACE_ID },
      { minRole: "owner", locationId: LOCATION_ID },
    );
    expect(google.calls).toEqual([]);
    expect(mocks.repo.cancel).not.toHaveBeenCalled();
    expect(mocks.consumePublishLimits).not.toHaveBeenCalled();

    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    const res = await deleteReplyRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "cancelled" });
  });

  it("not published 409", async () => {
    for (const state of ["publishing", "failed", "cancelled"] as const) {
      mocks.repo.getDelivery.mockResolvedValue(delivery({ state }));
      const res = await deleteReplyRoute();
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "delivery_not_published" });
    }
    expect(google.calls).toEqual([]);
    expect(mocks.consumePublishLimits).not.toHaveBeenCalled();
    expect(mocks.repo.cancel).not.toHaveBeenCalled();
  });

  it("changed on Google 409 and no DELETE sent", async () => {
    google.reply = OTHER_REPLY;
    const res = await deleteReplyRoute();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "reply_changed_on_google" });
    expect(google.methods).toEqual(["GET"]);
    expect(mocks.repo.cancel).not.toHaveBeenCalled();
  });

  it("equal → DELETE then cancel, 200 cancelled", async () => {
    google.reply = BODY.replace(/\n/g, "\r\n");
    const res = await deleteReplyRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "cancelled" });
    expect(google.methods).toEqual(["GET", "DELETE"]);
    expect(google.reply).toBeNull();
    expect(mocks.consumePublishLimits).toHaveBeenCalledWith("delete", { workspaceId: WORKSPACE_ID });
    expect(mocks.repo.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.repo.cancel).toHaveBeenCalledWith({ deliveryId: DELIVERY_ID, actorId: "user-1" });
  });

  it("no reply on Google, or a DELETE that finds none, still cancels", async () => {
    google.reply = null;
    expect(await (await deleteReplyRoute()).json()).toEqual({ state: "cancelled" });
    expect(google.methods).toEqual(["GET", "DELETE"]);

    google = new FakeGoogle();
    google.reply = BODY;
    google.deletes.push({ status: 404 });
    vi.stubGlobal("fetch", google.fetch);
    expect((await deleteReplyRoute()).status).toBe(200);
    expect(mocks.repo.cancel).toHaveBeenCalledTimes(2);
  });

  it("a review gone from Google means the reply is gone too: no DELETE, cancel without refund, 200 cancelled", async () => {
    google.gets.push({ status: 404 });
    const res = await deleteReplyRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "cancelled" });
    expect(google.methods).toEqual(["GET"]);
    // cancel_published_reply leaves counted and first_published_at alone (spec §1.4): no refund.
    expect(mocks.repo.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.repo.cancel).toHaveBeenCalledWith({ deliveryId: DELIVERY_ID, actorId: "user-1" });
  });

  it("Google 500 → 502 and no cancel", async () => {
    google.deletes.push({ status: 500 });
    const res = await deleteReplyRoute();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "provider_unavailable" });
    expect(mocks.repo.cancel).not.toHaveBeenCalled();

    google = new FakeGoogle();
    google.reply = BODY;
    google.gets.push({ status: 403 });
    vi.stubGlobal("fetch", google.fetch);
    const forbidden = await deleteReplyRoute();
    expect(forbidden.status).toBe(502);
    expect(await forbidden.json()).toEqual({ error: "provider_forbidden" });
    expect(google.methods).toEqual(["GET"]);
    expect(mocks.repo.cancel).not.toHaveBeenCalled();
  });

  it("a connection error is 409 with its code; an unreadable token is 503; neither cancels", async () => {
    mocks.withToken.mockRejectedValueOnce(new GbpConnectionError("connection_expired"));
    const expired = await deleteReplyRoute();
    expect(expired.status).toBe(409);
    expect(await expired.json()).toEqual({ error: "connection_expired" });
    mocks.withToken.mockRejectedValueOnce(new Error("token_unreadable"));
    expect((await deleteReplyRoute()).status).toBe(503);
    expect(mocks.repo.cancel).not.toHaveBeenCalled();
  });

  it("limiter refused 429; a cancel that loses a race is 409 with its code", async () => {
    mocks.consumePublishLimits.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 30 });
    expect((await deleteReplyRoute()).status).toBe(429);
    expect(google.calls).toEqual([]);

    mocks.repo.cancel.mockRejectedValueOnce(new PublishError("delivery_not_published"));
    const raced = await deleteReplyRoute();
    expect(raced.status).toBe(409);
    expect(await raced.json()).toEqual({ error: "delivery_not_published" });
  });
});

it("no console.error argument contains the reply body, review text, reviewer name or token", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const scenarios: Array<[() => void, () => Promise<Response>]> = [
    [() => { google.reply = OTHER_REPLY; }, () => reconcile()],
    [() => { google.gets.push({ throws: "timeout" }); }, () => reconcile()],
    [() => { google.gets.push({ status: 401 }, { status: 401 }); }, () => reconcile()],
    [() => { google.reply = BODY; mocks.repo.finish.mockRejectedValueOnce(new Error(`db said ${BODY}`)); }, () => reconcile()],
    [() => { mocks.withToken.mockRejectedValueOnce(new Error("token_unreadable")); }, () => reconcile()],
    [
      () => {
        mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
        mocks.repo.getDelivery.mockResolvedValue(delivery({ state: "published" }));
        google.reply = BODY;
        google.deletes.push({ status: 500 });
      },
      () => deleteReplyRoute(),
    ],
    [() => { google.reply = BODY; mocks.repo.cancel.mockRejectedValueOnce(new Error(`db said ${BODY}`)); }, () => deleteReplyRoute()],
    [
      () => {
        mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
        mocks.repo.getDelivery.mockResolvedValue(delivery({ state: "published" }));
        google.gets.push({ status: 404 });
      },
      () => deleteReplyRoute(),
    ],
  ];
  for (const [arrange, run] of scenarios) {
    google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    arrange();
    await run();
  }
  expect(spy.mock.calls.length + warn.mock.calls.length).toBeGreaterThan(0);
  const logged = JSON.stringify([...spy.mock.calls, ...warn.mock.calls], (_key, value: unknown) =>
    value instanceof Error ? { name: value.name, message: value.message } : value,
  );
  for (const secret of [BODY, "We hope to welcome you back", REVIEW_TEXT, REVIEWER, TOKEN, OTHER_REPLY]) {
    expect(logged).not.toContain(secret);
  }
  for (const call of [...spy.mock.calls, ...warn.mock.calls]) {
    for (const arg of call.slice(1)) {
      expect(Object.keys(arg as object).every((key) => ["category", "deliveryId"].includes(key))).toBe(true);
    }
  }
  spy.mockRestore();
  warn.mockRestore();
});
