import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real repository is never reached: every test injects a fake.
vi.mock("@/lib/db/client", () => ({
  getPool: () => {
    throw new Error("default_database_forbidden");
  },
}));

import { InstagramGraphError } from "@/lib/oauth/instagram-graph";
import type { PublishFailureReason, PublishReceipt } from "@/lib/repositories/publishing";
import { InstagramConnectionError, withInstagramAccessToken } from "./instagram-connection";
import {
  runInstagramPublish,
  type InstagramGraphClient,
  type RunInstagramPublishDeps,
} from "./instagram-run-publish";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const DELIVERY = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const TOKEN = "IGQVJtoken-PLAINTEXT";
const ACCOUNT = { id: "17841400000000000", username: "eldage" };
const CAPTION = "Fresh from the kitchen today.";
const IMAGE = "https://cdn.example.com/posts/today.jpg";
const CONTAINER = "container-1";
const MEDIA = "media-1";

type FinishInput = {
  deliveryId: string;
  actorId: string;
  outcome: "published" | "failed";
  receipt: PublishReceipt | null;
  reason: PublishFailureReason | null;
};

function repository() {
  return {
    finish: vi.fn(async (input: FinishInput) => ({
      kind: "finished" as const,
      state: (input.outcome === "published" ? "published" : "failed") as "published" | "failed",
      counted: input.outcome === "published",
    })),
    getDelivery: vi.fn(async () => null),
  };
}

function graph(overrides: Partial<InstagramGraphClient> = {}): InstagramGraphClient {
  return {
    createMediaContainer: async () => CONTAINER,
    getMediaContainerStatus: async () => "finished",
    publishMediaContainer: async () => MEDIA,
    getPublishedMedia: async () => ({ id: MEDIA, permalink: "https://www.instagram.com/p/abc/", timestamp: "2026-11-18T01:00:00+0000" }),
    ...overrides,
  } as unknown as InstagramGraphClient;
}

const withToken = (async (_workspaceId: string, fn: (token: string, account: typeof ACCOUNT) => Promise<unknown>) =>
  fn(TOKEN, ACCOUNT)) as unknown as typeof withInstagramAccessToken;

function deps(over: Partial<RunInstagramPublishDeps> = {}): RunInstagramPublishDeps {
  return {
    repository: repository() as unknown as RunInstagramPublishDeps["repository"],
    withToken,
    graph: graph(),
    sleep: async () => {},
    pollAttempts: 3,
    pollIntervalMs: 0,
    ...over,
  };
}

const savedKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});
afterEach(() => {
  vi.restoreAllMocks();
  if (savedKey === undefined) delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  else process.env.OAUTH_TOKEN_ENCRYPTION_KEY = savedKey;
});

describe("runInstagramPublish", () => {
  it("publishes a finished container once and finishes with the media receipt", async () => {
    const repo = repository();
    const g = graph();
    const create = vi.spyOn(g, "createMediaContainer");
    const publish = vi.spyOn(g, "publishMediaContainer");

    await expect(
      runInstagramPublish(
        { workspaceId: WORKSPACE, deliveryId: DELIVERY, actorId: ACTOR, imageUrl: IMAGE, caption: CAPTION },
        deps({ repository: repo as unknown as RunInstagramPublishDeps["repository"], graph: g }),
      ),
    ).resolves.toEqual({ state: "published", counted: true });

    expect(create).toHaveBeenCalledWith(TOKEN, ACCOUNT.id, { imageUrl: IMAGE, caption: CAPTION });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(repo.finish).toHaveBeenCalledTimes(1);
    expect(repo.finish.mock.calls[0][0]).toMatchObject({
      deliveryId: DELIVERY,
      actorId: ACTOR,
      outcome: "published",
      receipt: { media_id: MEDIA, permalink: "https://www.instagram.com/p/abc/", published_at: "2026-11-18T01:00:00+0000" },
      reason: null,
    });
  });

  it("polls an in-progress container and then publishes it", async () => {
    const g = graph({ getMediaContainerStatus: vi.fn<InstagramGraphClient["getMediaContainerStatus"]>()
      .mockResolvedValueOnce("in_progress")
      .mockResolvedValueOnce("finished") });
    const publish = vi.spyOn(g, "publishMediaContainer");

    await expect(
      runInstagramPublish(
        { workspaceId: WORKSPACE, deliveryId: DELIVERY, actorId: ACTOR, imageUrl: IMAGE, caption: CAPTION },
        deps({ graph: g }),
      ),
    ).resolves.toMatchObject({ state: "published" });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("fails definitely when the container never becomes ready, without publishing", async () => {
    const g = graph({ getMediaContainerStatus: async () => "in_progress" });
    const publish = vi.spyOn(g, "publishMediaContainer");
    const repo = repository();

    await expect(
      runInstagramPublish(
        { workspaceId: WORKSPACE, deliveryId: DELIVERY, actorId: ACTOR, imageUrl: IMAGE, caption: CAPTION },
        deps({ graph: g, repository: repo as unknown as RunInstagramPublishDeps["repository"] }),
      ),
    ).resolves.toEqual({ state: "failed", counted: false, reason: "provider_unavailable" });
    expect(publish).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed", reason: "provider_unavailable" }));
  });

  it.each([
    ["media_url_unreachable", "media_url_unreachable"],
    ["invalid_request", "provider_invalid_request"],
    ["rate_limited", "provider_rate_limited"],
  ] as const)("maps a definite container refusal (%s) to %s", async (code, reason) => {
    const g = graph({
      createMediaContainer: async () => {
        throw new InstagramGraphError(code);
      },
    });
    const repo = repository();

    await expect(
      runInstagramPublish(
        { workspaceId: WORKSPACE, deliveryId: DELIVERY, actorId: ACTOR, imageUrl: IMAGE, caption: CAPTION },
        deps({ graph: g, repository: repo as unknown as RunInstagramPublishDeps["repository"] }),
      ),
    ).resolves.toEqual({ state: "failed", counted: false, reason });
    expect(repo.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed", reason }));
  });

  it("leaves a transport-ambiguous publish uncertain and never publishes again", async () => {
    const g = graph({
      publishMediaContainer: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const readBack = vi.spyOn(g, "getPublishedMedia");
    const repo = repository();

    await expect(
      runInstagramPublish(
        { workspaceId: WORKSPACE, deliveryId: DELIVERY, actorId: ACTOR, imageUrl: IMAGE, caption: CAPTION },
        deps({ graph: g, repository: repo as unknown as RunInstagramPublishDeps["repository"] }),
      ),
    ).resolves.toEqual({ state: "publishing", counted: false });
    expect(repo.finish).not.toHaveBeenCalled();
    expect(readBack).not.toHaveBeenCalled();
  });

  it("leaves a provider_unavailable publish uncertain", async () => {
    const g = graph({
      publishMediaContainer: async () => {
        throw new InstagramGraphError("provider_unavailable");
      },
    });
    const repo = repository();

    await expect(
      runInstagramPublish(
        { workspaceId: WORKSPACE, deliveryId: DELIVERY, actorId: ACTOR, imageUrl: IMAGE, caption: CAPTION },
        deps({ graph: g, repository: repo as unknown as RunInstagramPublishDeps["repository"] }),
      ),
    ).resolves.toEqual({ state: "publishing", counted: false });
    expect(repo.finish).not.toHaveBeenCalled();
  });

  it("does not publish twice when the read-back fails: it stays uncertain", async () => {
    const g = graph({
      getPublishedMedia: async () => {
        throw new InstagramGraphError("provider_unavailable");
      },
    });
    const publish = vi.spyOn(g, "publishMediaContainer");
    const repo = repository();

    await expect(
      runInstagramPublish(
        { workspaceId: WORKSPACE, deliveryId: DELIVERY, actorId: ACTOR, imageUrl: IMAGE, caption: CAPTION },
        deps({ graph: g, repository: repo as unknown as RunInstagramPublishDeps["repository"] }),
      ),
    ).resolves.toEqual({ state: "publishing", counted: false });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(repo.finish).not.toHaveBeenCalled();
  });

  it("finishes failed when the connection is unusable before any write", async () => {
    const repo = repository();
    const failing = (async () => {
      throw new InstagramConnectionError("connection_expired");
    }) as unknown as typeof withInstagramAccessToken;

    await expect(
      runInstagramPublish(
        { workspaceId: WORKSPACE, deliveryId: DELIVERY, actorId: ACTOR, imageUrl: IMAGE, caption: CAPTION },
        deps({ withToken: failing, repository: repo as unknown as RunInstagramPublishDeps["repository"] }),
      ),
    ).resolves.toEqual({ state: "failed", counted: false, reason: "connection_expired" });
  });
});
