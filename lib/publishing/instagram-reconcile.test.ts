import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real repository is never reached: every test injects a fake.
vi.mock("@/lib/db/client", () => ({
  getPool: () => {
    throw new Error("default_database_forbidden");
  },
}));

import { withInstagramAccessToken } from "./instagram-connection";
import { reconcileInstagramDelivery } from "./instagram-reconcile";
import type { PublishDelivery } from "@/lib/repositories/publishing";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const DELIVERY = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const TOKEN = "IGQVJtoken-PLAINTEXT";
const ACCOUNT = { id: "17841400000000000", username: "eldage" };
const CAPTION = "Fresh from the kitchen today.";
const NOW = Date.parse("2026-11-18T01:05:00Z");

const delivery = (over: Partial<PublishDelivery> = {}): PublishDelivery => ({
  id: DELIVERY,
  workspaceId: WORKSPACE,
  versionId: "44444444-4444-4444-8444-444444444444",
  actionId: "55555555-5555-4555-8555-555555555555",
  locationId: null,
  templateKey: "social-post",
  versionNo: 1,
  body: CAPTION,
  state: "publishing",
  channel: "instagram",
  payload: { version_no: 1, image_url: "https://cdn.example.com/posts/today.jpg", caption: CAPTION },
  targetRef: ACCOUNT.id,
  counted: false,
  failureReason: null,
  verifiedAt: null,
  createdAt: new Date(NOW - 3 * 60 * 1000).toISOString(),
  ...over,
});

const media = (over: Partial<{ id: string; permalink: string | null; timestamp: string | null; caption: string | null }> = {}) => ({
  id: "media-1",
  permalink: "https://www.instagram.com/p/abc/",
  timestamp: "2026-11-18T01:03:00+0000",
  caption: CAPTION,
  ...over,
});

function repository() {
  return {
    finish: vi.fn(async (): Promise<{ kind: "finished"; state: "published" | "failed"; counted: boolean }> => ({
      kind: "finished",
      state: "published",
      counted: true,
    })),
    getDelivery: vi.fn(async () => null),
  };
}

const withToken = (async (_workspaceId: string, fn: (token: string, account: typeof ACCOUNT) => Promise<unknown>) =>
  fn(TOKEN, ACCOUNT)) as unknown as typeof withInstagramAccessToken;

const savedKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});
afterEach(() => {
  vi.restoreAllMocks();
  if (savedKey === undefined) delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  else process.env.OAUTH_TOKEN_ENCRYPTION_KEY = savedKey;
});

describe("reconcileInstagramDelivery", () => {
  it("settles published with the receipt when exactly one recent media matches the caption", async () => {
    const repo = repository();
    const listMedia = vi.fn(async () => [media()]);

    await expect(
      reconcileInstagramDelivery(delivery(), ACTOR, {
        repository: repo as never,
        withToken,
        listMedia: listMedia as never,
        now: () => NOW,
      }),
    ).resolves.toEqual({ state: "published", counted: true, settledNow: true });
    expect(listMedia).toHaveBeenCalledWith(TOKEN, ACCOUNT.id, { limit: 20 });
    expect(repo.finish).toHaveBeenCalledWith({
      deliveryId: DELIVERY,
      actorId: ACTOR,
      outcome: "published",
      receipt: { media_id: "media-1", permalink: "https://www.instagram.com/p/abc/", published_at: "2026-11-18T01:03:00+0000" },
      reason: null,
    });
  });

  it("settles failed: not_applied when no recent media matches", async () => {
    const repo = repository();
    repo.finish.mockResolvedValue({ kind: "finished", state: "failed", counted: false });

    await expect(
      reconcileInstagramDelivery(delivery(), ACTOR, {
        repository: repo as never,
        withToken,
        listMedia: (async () => [media({ caption: "a different post" })]) as never,
        now: () => NOW,
      }),
    ).resolves.toEqual({ state: "failed", counted: false, reason: "not_applied", settledNow: true });
    expect(repo.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed", reason: "not_applied" }));
  });

  it("ignores media older than the delivery window and unknown timestamps", async () => {
    const repo = repository();
    repo.finish.mockResolvedValue({ kind: "finished", state: "failed", counted: false });

    await expect(
      reconcileInstagramDelivery(delivery(), ACTOR, {
        repository: repo as never,
        withToken,
        listMedia: (async () => [
          media({ id: "old", timestamp: "2026-11-18T00:30:00+0000" }),
          media({ id: "no-time", timestamp: null }),
        ]) as never,
        now: () => NOW,
      }),
    ).resolves.toMatchObject({ state: "failed", reason: "not_applied" });
  });

  it("stays publishing (ambiguous) when two media match instead of guessing", async () => {
    const repo = repository();

    await expect(
      reconcileInstagramDelivery(delivery(), ACTOR, {
        repository: repo as never,
        withToken,
        listMedia: (async () => [media({ id: "a" }), media({ id: "b" })]) as never,
        now: () => NOW,
      }),
    ).resolves.toEqual({ state: "publishing", counted: false, reason: "ambiguous", settledNow: false });
    expect(repo.finish).not.toHaveBeenCalled();
  });

  it("never guesses from a delivery with no caption snapshot", async () => {
    const repo = repository();
    repo.finish.mockResolvedValue({ kind: "finished", state: "failed", counted: false });

    await expect(
      reconcileInstagramDelivery(delivery({ payload: { version_no: 1 } }), ACTOR, {
        repository: repo as never,
        withToken,
        listMedia: (async () => [media()]) as never,
        now: () => NOW,
      }),
    ).resolves.toMatchObject({ state: "failed", reason: "not_applied" });
  });

  it("rethrows a provider read failure and changes nothing", async () => {
    const repo = repository();

    await expect(
      reconcileInstagramDelivery(delivery(), ACTOR, {
        repository: repo as never,
        withToken,
        listMedia: (async () => {
          throw new Error("graph down");
        }) as never,
        now: () => NOW,
      }),
    ).rejects.toThrow("graph down");
    expect(repo.finish).not.toHaveBeenCalled();
  });
});
