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
// NFC, with a newline: the read-back tests return a CRLF + NFD variant of it.
const BODY = "Thank you for visiting, and sorry about the café service.\nWe hope to welcome you back.";
const IDEMPOTENCY_KEY = "abcdefghijklmnop_-01";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  consumePublishLimits: vi.fn(),
  getUsage: vi.fn(),
  sendDeliveryNotices: vi.fn(),
  workspaces: vi.fn(),
  repoFactory: vi.fn(),
  withToken: vi.fn(),
  repo: {
    publishSubject: vi.fn(),
    candidateReviewTexts: vi.fn(),
    activeGbpConnection: vi.fn(),
    begin: vi.fn(),
    finish: vi.fn(),
    getDelivery: vi.fn(),
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

import { GbpConnectionError } from "@/lib/publishing/connection";
import { PublishError } from "@/lib/repositories/publishing";
import { GBP_SCOPE_REQUIRED } from "@/lib/oauth/google-connection";
import { GbpError } from "@/lib/oauth/google-reviews";

const unauthorized = (e: unknown) => e instanceof GbpError && e.code === "unauthorized";

/** Passes straight through to fn with a fixed token, with the real helper's one retry on unauthorized and expiry on a second. */
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
// A fake Google: accounts → locations → reviews, one review whose reply the
// PUT stores. Per-call overrides are queued; every request is recorded.

/** `lands`: on a PUT, Google stores the reply before the connection is lost. */
type Step = { status?: number; throws?: "timeout" | "network"; json?: unknown; lands?: boolean };
type Call = { method: string; url: string; body: string | null };

class FakeGoogle {
  reply: string | null = null;
  replyTime = "2026-10-04T09:00:00Z";
  placeId = "place-1";
  /** How Google echoes a stored reply back (identity by default). */
  storeAs: (comment: string) => string = (comment) => comment;
  reviewGets: Step[] = [];
  puts: Step[] = [];
  lists: Step[] = [];
  accounts: Step[] = [];
  calls: Call[] = [];

  get reviewCalls(): Call[] {
    return this.calls.filter((c) => c.url.includes("/reviews"));
  }
  get putCalls(): Call[] {
    return this.calls.filter((c) => c.method === "PUT");
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    this.calls.push({ method, url, body: typeof init?.body === "string" ? init.body : null });
    const path = new URL(url).pathname;

    if (url.startsWith("https://mybusinessaccountmanagement.googleapis.com/v1/accounts")) {
      return this.answer(this.accounts.shift(), { accounts: [{ name: "accounts/1" }] });
    }
    if (url.startsWith("https://mybusinessbusinessinformation.googleapis.com/v1/accounts/1/locations")) {
      return this.answer(undefined, { locations: [{ name: "locations/2", metadata: { placeId: this.placeId } }] });
    }
    if (method === "GET" && path === "/v4/accounts/1/locations/2/reviews") {
      return this.answer(this.lists.shift(), {
        reviews: [
          { name: "accounts/1/locations/2/reviews/r2", reviewer: { displayName: "Newest" }, starRating: "FIVE", comment: "Lovely dinner", createTime: "2026-10-03T00:00:00Z" },
          { name: REVIEW_NAME, reviewer: { displayName: REVIEWER }, starRating: "TWO", comment: REVIEW_TEXT, createTime: "2026-10-01T00:00:00Z" },
        ],
      });
    }
    if (method === "GET" && path === `/v4/${REVIEW_NAME}`) {
      return this.answer(this.reviewGets.shift(), {
        name: REVIEW_NAME,
        reviewer: { displayName: REVIEWER },
        comment: REVIEW_TEXT,
        ...(this.reply === null ? {} : { reviewReply: { comment: this.reply, updateTime: this.replyTime } }),
      });
    }
    if (method === "PUT" && path === `/v4/${REVIEW_NAME}/reply`) {
      const step = this.puts.shift();
      if (step?.lands) this.reply = this.storeAs((JSON.parse(String(init?.body)) as { comment: string }).comment);
      if (step?.throws || (step?.status && step.status >= 300)) return this.answer(step, {});
      this.reply = this.storeAs((JSON.parse(String(init?.body)) as { comment: string }).comment);
      return this.answer(step, { comment: this.reply, updateTime: this.replyTime });
    }
    return new Response("{}", { status: 404 });
  };

  private answer(step: Step | undefined, fallback: unknown): Response {
    if (step?.throws === "timeout") throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    if (step?.throws === "network") throw new TypeError("fetch failed");
    const status = step?.status ?? 200;
    return new Response(JSON.stringify(status >= 300 ? { error: { message: `echo ${TOKEN} ${REVIEW_TEXT}` } } : (step?.json ?? fallback)), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
}

let google: FakeGoogle;

const subject = (over: Record<string, unknown> = {}) => ({
  workspaceId: WORKSPACE_ID,
  actionId: ACTION_ID,
  locationId: LOCATION_ID,
  placeId: "place-1",
  templateKey: "review-response",
  versionNo: 2,
  approvalState: "approved",
  body: BODY,
  ...over,
});

const PARAMS = { params: Promise.resolve({ versionId: VERSION_ID }) };

async function targets(versionId = VERSION_ID) {
  const { GET } = await import("./targets/route");
  return GET(new Request(`https://app.test/api/versions/${versionId}/publish/targets`), {
    params: Promise.resolve({ versionId }),
  });
}

async function publish(body: unknown = {}, versionId = VERSION_ID) {
  const { POST } = await import("./route");
  return POST(
    new Request(`https://app.test/api/versions/${versionId}/publish`, {
      method: "POST",
      body: JSON.stringify({ reviewName: REVIEW_NAME, idempotencyKey: IDEMPOTENCY_KEY, confirmVersionNo: 2, ...(body as object) }),
    }),
    versionId === VERSION_ID ? PARAMS : { params: Promise.resolve({ versionId }) },
  );
}

const usageJson = { period: "2026-10", approved_deliveries: 1, allowance: 3 };

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
  mocks.repo.publishSubject.mockResolvedValue(subject());
  mocks.repo.candidateReviewTexts.mockResolvedValue([]);
  mocks.repo.activeGbpConnection.mockResolvedValue({
    id: "conn-1",
    accessTokenEncrypted: "sealed",
    refreshTokenEncrypted: "sealed",
    scopes: [GBP_SCOPE_REQUIRED],
    expiresAt: null,
  });
  mocks.repo.begin.mockResolvedValue({ kind: "begun", deliveryId: DELIVERY_ID, state: "publishing" });
  mocks.repo.finish.mockImplementation(async (input: { outcome: "published" | "failed" }) => ({
    kind: "finished",
    state: input.outcome,
    counted: input.outcome === "published",
  }));
  mocks.repo.getDelivery.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("flag", () => {
  it("flag off: both routes 404 not_enabled and no repository call", async () => {
    vi.stubEnv("GBP_REPLY_PUBLISH_ENABLED", "false");
    for (const res of [await targets(), await publish()]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_enabled" });
    }
    expect(mocks.repoFactory).not.toHaveBeenCalled();
    for (const fn of Object.values(mocks.repo)) expect(fn).not.toHaveBeenCalled();
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(google.calls).toEqual([]);
  });

  it("a malformed version id is 400 before anything else", async () => {
    expect((await targets("not-a-uuid")).status).toBe(400);
    expect((await publish({}, "not-a-uuid")).status).toBe(400);
    expect(mocks.repo.publishSubject).not.toHaveBeenCalled();
  });

  it("an unknown version is 404", async () => {
    mocks.repo.publishSubject.mockResolvedValue(null);
    expect((await targets()).status).toBe(404);
    expect((await publish()).status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });
});

describe("authority", () => {
  it("viewer 403; manager out of scope 403; owner and in-scope manager pass", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await targets()).status).toBe(403);
    expect((await publish()).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", ["elsewhere"]));
    expect((await targets()).status).toBe(403);
    expect((await publish()).status).toBe(403);
    expect(google.calls).toEqual([]);
    expect(mocks.repo.begin).not.toHaveBeenCalled();

    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    expect((await targets()).status).toBe(200);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [LOCATION_ID]));
    expect((await targets()).status).toBe(200);
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith(
      { id: WORKSPACE_ID },
      { minRole: "manager", locationId: LOCATION_ID },
    );
  });

  it("an unauthenticated caller gets the auth status", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    const res = await publish();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });
});

describe("eligibility", () => {
  it.each([
    ["not_review_response", { templateKey: "social-post" }],
    ["not_approved", { approvalState: "draft" }],
    ["no_location_listing", { placeId: null }],
    ["too_long", { body: "字".repeat(1366) }],
    ["empty_body", { body: "   " }],
  ])("eligibility reasons return 409 with the reason (%s); too_long never reaches begin", async (reason, over) => {
    mocks.repo.publishSubject.mockResolvedValue(subject(over));
    for (const res of [await targets(), await publish()]) {
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: reason });
    }
    expect(mocks.repo.begin).not.toHaveBeenCalled();
    expect(mocks.consumePublishLimits).not.toHaveBeenCalled();
    expect(google.calls).toEqual([]);
  });

  it("no active connection with business.manage is connection_missing", async () => {
    mocks.repo.activeGbpConnection.mockResolvedValue(null);
    const res = await publish();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "connection_missing" });
    mocks.repo.activeGbpConnection.mockResolvedValue({
      id: "conn-1",
      accessTokenEncrypted: "sealed",
      refreshTokenEncrypted: null,
      scopes: ["openid"],
      expiresAt: null,
    });
    expect(await (await targets()).json()).toEqual({ error: "connection_missing" });
    expect(google.calls).toEqual([]);
  });
});

describe("GET …/publish/targets", () => {
  it("location_not_managed 409 when no managed location carries the place", async () => {
    google.placeId = "another-place";
    const res = await targets();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "location_not_managed" });
    expect(google.reviewCalls).toEqual([]);
  });

  it("returns targets and preselected from candidate texts", async () => {
    mocks.repo.candidateReviewTexts.mockResolvedValue(["the noodles were COLD and the waiter ignored us entirely, never again"]);
    const res = await targets();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { targets: Array<{ reviewName: string }>; preselected: string | null };
    expect(json.targets.map((t) => t.reviewName)).toEqual(["accounts/1/locations/2/reviews/r2", REVIEW_NAME]);
    expect(json.preselected).toBe(REVIEW_NAME);
    expect(mocks.consumePublishLimits).toHaveBeenCalledWith("targets", { workspaceId: WORKSPACE_ID });
    expect(mocks.repo.candidateReviewTexts).toHaveBeenCalledWith(VERSION_ID);
  });

  it("with no matching candidate the newest target is preselected", async () => {
    const json = (await (await targets()).json()) as { preselected: string | null };
    expect(json.preselected).toBe("accounts/1/locations/2/reviews/r2");
  });

  it("limiter refused 429 with Retry-After; unavailable 503; neither calls Google", async () => {
    mocks.consumePublishLimits.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const limited = await targets();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");
    mocks.consumePublishLimits.mockResolvedValue({ allowed: false, unavailable: true });
    expect((await targets()).status).toBe(503);
    expect(google.calls).toEqual([]);
  });

  it("a connection error is 409 with its code; a Google failure is 502 with a reason code; an unreadable token is 503", async () => {
    google.accounts.push({ status: 500 });
    const failed = await targets();
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "provider_unavailable" });

    google.lists.push({ status: 403 });
    const forbidden = await targets();
    expect(forbidden.status).toBe(502);
    expect(await forbidden.json()).toEqual({ error: "provider_forbidden" });

    google.accounts.push({ status: 401 }, { status: 401 });
    const expired = await targets();
    expect(expired.status).toBe(409);
    expect(await expired.json()).toEqual({ error: "connection_expired" });

    mocks.withToken.mockRejectedValueOnce(new Error("token_unreadable"));
    const unreadable = await targets();
    expect(unreadable.status).toBe(503);
    expect(await unreadable.json()).toEqual({ error: "unavailable" });
  });
});

describe("POST …/publish refusals before begin", () => {
  it("400s a malformed body", async () => {
    for (const body of [{ idempotencyKey: "short" }, { confirmVersionNo: 2.5 }, { reviewName: 7 }]) {
      expect((await publish(body)).status).toBe(400);
    }
    expect(mocks.repo.begin).not.toHaveBeenCalled();
  });

  it("version_changed 409 without calling Google", async () => {
    const res = await publish({ confirmVersionNo: 1 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "version_changed" });
    expect(google.calls).toEqual([]);
    expect(mocks.repo.begin).not.toHaveBeenCalled();
  });

  it("target_not_in_location 403", async () => {
    for (const reviewName of ["accounts/1/locations/9/reviews/r1", `${REVIEW_NAME}/reply`, "accounts/1/locations/2/reviews/a%2Fb"]) {
      const res = await publish({ reviewName });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "target_not_in_location" });
    }
    expect(mocks.repo.begin).not.toHaveBeenCalled();
    expect(google.reviewCalls).toEqual([]);
  });

  it("location_not_managed 409", async () => {
    google.placeId = "another-place";
    const res = await publish();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "location_not_managed" });
    expect(mocks.repo.begin).not.toHaveBeenCalled();
  });

  it("limiter refused 429 with Retry-After; limiter unavailable 503", async () => {
    mocks.consumePublishLimits.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
    const limited = await publish();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("120");
    expect(mocks.consumePublishLimits).toHaveBeenCalledWith("publish", { workspaceId: WORKSPACE_ID });
    mocks.consumePublishLimits.mockResolvedValue({ allowed: false, unavailable: true });
    expect((await publish()).status).toBe(503);
    expect(mocks.repo.begin).not.toHaveBeenCalled();
    expect(google.reviewCalls).toEqual([]);
  });

  it("a connection error before begin is 409; a Google error before begin is 502", async () => {
    google.accounts.push({ status: 401 }, { status: 401 });
    const expired = await publish();
    expect(expired.status).toBe(409);
    expect(await expired.json()).toEqual({ error: "connection_expired" });
    google.accounts.push({ status: 429 });
    const limited = await publish();
    expect(limited.status).toBe(502);
    expect(await limited.json()).toEqual({ error: "provider_rate_limited" });
    expect(mocks.repo.begin).not.toHaveBeenCalled();
  });
});

describe("POST …/publish", () => {
  it("publish happy path: pre-read no reply, PUT, read-back equal → published, counted, notices sent once", async () => {
    const res = await publish();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deliveryId: DELIVERY_ID, state: "published", counted: true, usage: usageJson });
    expect(mocks.repo.begin).toHaveBeenCalledWith({
      versionId: VERSION_ID,
      actorId: "user-1",
      targetRef: REVIEW_NAME,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(google.reviewCalls.map((c) => c.method)).toEqual(["GET", "PUT", "GET"]);
    expect(JSON.parse(google.putCalls[0]!.body!)).toEqual({ comment: BODY });
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
    expect(mocks.getUsage).toHaveBeenCalledWith(expect.anything(), WORKSPACE_ID, "Asia/Hong_Kong", "lite");
  });

  it("read-back with CRLF and NFD variant of our body → published", async () => {
    google.storeAs = (comment) => `${comment.replace(/\n/g, "\r\n").normalize("NFD")}  `;
    const res = await publish();
    expect(await res.json()).toMatchObject({ state: "published", counted: true });
    expect(google.reply).not.toBe(BODY);
    expect(google.putCalls).toHaveLength(1);
  });

  it("read-back that differs from our body stays publishing, one PUT, no finish", async () => {
    google.storeAs = () => "Something else entirely";
    const res = await publish();
    expect(await res.json()).toEqual({ deliveryId: DELIVERY_ID, state: "publishing", counted: false, usage: usageJson });
    expect(google.putCalls).toHaveLength(1);
    expect(mocks.repo.finish).not.toHaveBeenCalled();
    expect(mocks.sendDeliveryNotices).not.toHaveBeenCalled();
  });

  it("pre-read finds a different reply → failed already_replied and no PUT was sent", async () => {
    google.reply = "An earlier reply from the owner";
    const res = await publish();
    expect(await res.json()).toEqual({
      deliveryId: DELIVERY_ID,
      state: "failed",
      counted: false,
      reason: "already_replied",
      usage: usageJson,
    });
    expect(google.putCalls).toEqual([]);
    expect(mocks.repo.finish).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed", reason: "already_replied", receipt: null }),
    );
    expect(mocks.sendDeliveryNotices).not.toHaveBeenCalled();
  });

  it("pre-read finds our body → published without a PUT", async () => {
    google.reply = BODY.replace(/\n/g, "\r\n");
    const res = await publish();
    expect(await res.json()).toMatchObject({ state: "published", counted: true });
    expect(google.putCalls).toEqual([]);
    expect(mocks.repo.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "published",
        receipt: { review_name: REVIEW_NAME, reply_update_time: "2026-10-04T09:00:00Z" },
      }),
    );
  });

  it.each(["timeout", "network", 500] as const)(
    "put %s leaves publishing with exactly one PUT sent and finish never called",
    async (failure) => {
      google.puts.push(typeof failure === "number" ? { status: failure } : { throws: failure });
      const res = await publish();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deliveryId: DELIVERY_ID, state: "publishing", counted: false, usage: usageJson });
      expect(google.putCalls).toHaveLength(1);
      expect(mocks.repo.finish).not.toHaveBeenCalled();
      expect(mocks.sendDeliveryNotices).not.toHaveBeenCalled();
    },
  );

  it("put timeout leaves publishing; reconcile then publishes and counts once", async () => {
    // The PUT reaches Google, but the connection drops before the 2xx.
    google.puts.push({ throws: "timeout", lands: true });
    const res = await publish();
    expect(await res.json()).toEqual({ deliveryId: DELIVERY_ID, state: "publishing", counted: false, usage: usageJson });
    expect(google.putCalls).toHaveLength(1);
    expect(mocks.repo.finish).not.toHaveBeenCalled();
    expect(mocks.sendDeliveryNotices).not.toHaveBeenCalled();

    // The delivery as the repository now holds it, old enough to reconcile.
    mocks.repo.getDelivery.mockResolvedValue({
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
      createdAt: new Date(Date.now() - 16_000).toISOString(),
    });
    const { POST: reconcile } = await import("@/app/api/deliveries/[deliveryId]/reconcile/route");
    const settled = await reconcile(new Request(`https://app.test/api/deliveries/${DELIVERY_ID}/reconcile`, { method: "POST" }), {
      params: Promise.resolve({ deliveryId: DELIVERY_ID }),
    });
    expect(settled.status).toBe(200);
    expect(await settled.json()).toEqual({ deliveryId: DELIVERY_ID, state: "published", counted: true });

    expect(google.putCalls).toHaveLength(1);
    expect(google.reviewCalls.map((c) => c.method)).toEqual(["GET", "PUT", "GET"]);
    expect(mocks.repo.finish).toHaveBeenCalledTimes(1);
    expect(mocks.repo.finish).toHaveBeenCalledWith({
      deliveryId: DELIVERY_ID,
      actorId: "user-1",
      outcome: "published",
      receipt: { review_name: REVIEW_NAME, reply_update_time: "2026-10-04T09:00:00Z" },
      reason: null,
    });
    expect(mocks.sendDeliveryNotices).toHaveBeenCalledTimes(1);
    expect(mocks.consumePublishLimits).toHaveBeenCalledWith("reconcile", { workspaceId: WORKSPACE_ID, deliveryId: DELIVERY_ID });
  });

  it.each(["timeout", 503, 401, 429] as const)("a read-back failure (%s) after a 2xx PUT stays publishing with one PUT", async (failure) => {
    google.reviewGets.push({}, typeof failure === "number" ? { status: failure } : { throws: failure });
    const res = await publish();
    expect(await res.json()).toMatchObject({ state: "publishing", counted: false });
    expect(google.putCalls).toHaveLength(1);
    expect(mocks.repo.finish).not.toHaveBeenCalled();
  });

  it.each(["timeout", "network", 500] as const)("a pre-read %s is failed provider_unavailable with no PUT", async (failure) => {
    google.reviewGets.push(typeof failure === "number" ? { status: failure } : { throws: failure });
    const res = await publish();
    expect(await res.json()).toMatchObject({ state: "failed", reason: "provider_unavailable", counted: false });
    expect(google.putCalls).toEqual([]);
  });

  it.each([
    ["401 twice", [{ status: 401 }, { status: 401 }], "connection_expired"],
    ["403", [{ status: 403 }], "provider_forbidden"],
    ["429", [{ status: 429 }], "provider_rate_limited"],
    ["404", [{ status: 404 }], "review_not_found"],
  ] as const)("pre-read %s → failed %s", async (_label, steps, reason) => {
    google.reviewGets.push(...steps);
    const res = await publish();
    expect(await res.json()).toEqual({ deliveryId: DELIVERY_ID, state: "failed", counted: false, reason, usage: usageJson });
    expect(google.putCalls).toEqual([]);
    expect(mocks.repo.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed", reason, receipt: null }));
  });

  it.each([
    [403, "provider_forbidden"],
    [429, "provider_rate_limited"],
    [404, "review_not_found"],
  ] as const)("a PUT %s is failed %s with exactly one PUT", async (status, reason) => {
    google.puts.push({ status });
    const res = await publish();
    expect(await res.json()).toMatchObject({ state: "failed", reason, counted: false });
    expect(google.putCalls).toHaveLength(1);
  });

  it("a 401 on the PUT re-reads before writing again, and publishes once", async () => {
    google.puts.push({ status: 401 });
    const res = await publish();
    expect(await res.json()).toMatchObject({ state: "published", counted: true });
    expect(google.reviewCalls.map((c) => c.method)).toEqual(["GET", "PUT", "GET", "PUT", "GET"]);
  });

  it("same idempotency key returns the existing delivery and sends nothing to Google", async () => {
    mocks.repo.begin.mockResolvedValue({ kind: "existing", deliveryId: DELIVERY_ID, state: "failed" });
    mocks.repo.getDelivery.mockResolvedValue({
      id: DELIVERY_ID,
      workspaceId: WORKSPACE_ID,
      versionId: VERSION_ID,
      actionId: ACTION_ID,
      locationId: LOCATION_ID,
      templateKey: "review-response",
      versionNo: 2,
      body: BODY,
      state: "failed",
      targetRef: REVIEW_NAME,
      counted: false,
      failureReason: "provider_forbidden",
      verifiedAt: null,
      createdAt: "2026-10-04T08:00:00.000Z",
    });
    const res = await publish();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deliveryId: DELIVERY_ID,
      state: "failed",
      counted: false,
      reason: "provider_forbidden",
      usage: usageJson,
    });
    expect(google.reviewCalls).toEqual([]);
    expect(mocks.repo.finish).not.toHaveBeenCalled();
    expect(mocks.sendDeliveryNotices).not.toHaveBeenCalled();
  });

  it("an idempotency key that names another version's delivery is refused", async () => {
    mocks.repo.begin.mockResolvedValue({ kind: "existing", deliveryId: DELIVERY_ID, state: "published" });
    mocks.repo.getDelivery.mockResolvedValue({ id: DELIVERY_ID, workspaceId: "other", versionId: "other", state: "published", counted: true, failureReason: null });
    const res = await publish();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "idempotency_key_conflict" });
    expect(google.reviewCalls).toEqual([]);
  });

  it.each(["already_publishing", "target_busy", "not_approved", "allowance_exceeded", "offer_expired"] as const)(
    "%s from begin → 409 and no Google call",
    async (code) => {
      mocks.repo.begin.mockRejectedValue(new PublishError(code, code === "already_publishing" ? DELIVERY_ID : null));
      const res = await publish();
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: code });
      expect(google.reviewCalls).toEqual([]);
      expect(mocks.repo.finish).not.toHaveBeenCalled();
    },
  );

  it("a connection that disappears after begin is failed connection_expired", async () => {
    mocks.withToken.mockImplementationOnce(passThrough).mockRejectedValueOnce(new GbpConnectionError("connection_expired"));
    const res = await publish();
    expect(await res.json()).toMatchObject({ state: "failed", reason: "connection_expired" });
    expect(google.reviewCalls).toEqual([]);
  });

  it("no console.error argument contains the reply body, review text, reviewer name or token", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const scenarios: Array<() => void> = [
      () => undefined,
      () => {
        google.reply = "An earlier reply";
      },
      () => {
        google.puts.push({ throws: "timeout" });
      },
      () => {
        google.reviewGets.push({ status: 403 });
      },
      () => {
        google.reviewGets.push({ status: 401 }, { status: 401 });
      },
      () => {
        google.storeAs = () => "different";
      },
      () => {
        mocks.repo.finish.mockRejectedValueOnce(new Error(`db said ${BODY}`));
      },
    ];
    for (const arrange of scenarios) {
      google = new FakeGoogle();
      vi.stubGlobal("fetch", google.fetch);
      arrange();
      await publish();
    }
    google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    google.lists.push({ status: 500 });
    await targets();

    expect(spy.mock.calls.length + warn.mock.calls.length).toBeGreaterThan(0);
    const logged = JSON.stringify([...spy.mock.calls, ...warn.mock.calls], (_key, value: unknown) =>
      value instanceof Error ? { name: value.name, message: value.message } : value,
    );
    for (const secret of [BODY, "We hope to welcome you back", REVIEW_TEXT, REVIEWER, TOKEN, "An earlier reply"]) {
      expect(logged).not.toContain(secret);
    }
    for (const call of [...spy.mock.calls, ...warn.mock.calls]) {
      for (const arg of call.slice(1)) {
        expect(Object.keys(arg as object).every((key) => ["category", "deliveryId", "versionId"].includes(key))).toBe(true);
      }
    }
    spy.mockRestore();
    warn.mockRestore();
  });
});
