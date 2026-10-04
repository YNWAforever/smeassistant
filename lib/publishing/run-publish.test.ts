import { beforeEach, describe, expect, it, vi } from "vitest";

// Every test injects the repository, the token helper and fetch.
vi.mock("@/lib/db/client", () => ({
  getPool: () => {
    throw new Error("default_database_forbidden");
  },
}));

import { REVIEWS_BASE } from "@/lib/oauth/google-reviews";
import { runPublish } from "./run-publish";

const TOKEN = "ya29.token-PLAINTEXT";
const REVIEW = "accounts/1/locations/2/reviews/r1";
const BODY = "Thank you, see you soon.";
const DELIVERY = "66666666-6666-4666-8666-666666666666";

function repository() {
  return {
    finish: vi.fn(async (input: { outcome: "published" | "failed" }) => ({
      kind: "finished" as const,
      state: input.outcome,
      counted: input.outcome === "published",
    })),
    getDelivery: vi.fn(async () => null),
  };
}

const withToken = async <T,>(_workspaceId: string, fn: (token: string) => Promise<T>) => fn(TOKEN);

/** Answers review GETs from `gets` in order and PUTs from `puts`; records every call. */
function google(gets: Array<() => Response>, puts: Array<() => Response> = []) {
  const calls: Array<{ method: string; url: string; auth: string | null }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(input), auth: new Headers(init?.headers).get("authorization") });
    const next = method === "PUT" ? puts.shift() : gets.shift();
    if (!next) throw new Error("unexpected call");
    return next();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const review = (reply: string | null) => () =>
  new Response(JSON.stringify({ name: REVIEW, ...(reply === null ? {} : { reviewReply: { comment: reply, updateTime: "2026-10-04T10:00:00Z" } }) }), {
    status: 200,
  });
const ok = () => new Response("{}", { status: 200 });

const input = { workspaceId: "ws-1", deliveryId: DELIVERY, actorId: "user-1", reviewName: REVIEW, body: BODY };

describe("runPublish", () => {
  let repo: ReturnType<typeof repository>;
  beforeEach(() => {
    repo = repository();
  });

  it("uses the injected fetch and token: pre-read, PUT, verified read-back, finish published with the receipt", async () => {
    const g = google([review(null), review(BODY)], [ok]);
    expect(await runPublish(input, { repository: repo, fetchImpl: g.fetchImpl, withToken })).toEqual({
      state: "published",
      counted: true,
    });
    expect(g.calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", `${REVIEWS_BASE}/${REVIEW}`],
      ["PUT", `${REVIEWS_BASE}/${REVIEW}/reply`],
      ["GET", `${REVIEWS_BASE}/${REVIEW}`],
    ]);
    expect(g.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
    expect(repo.finish).toHaveBeenCalledWith({
      deliveryId: DELIVERY,
      actorId: "user-1",
      outcome: "published",
      receipt: { review_name: REVIEW, reply_update_time: "2026-10-04T10:00:00Z" },
      reason: null,
    });
  });

  it("a read-back with no reply stays publishing without finishing", async () => {
    const g = google([review(null), review(null)], [ok]);
    expect(await runPublish(input, { repository: repo, fetchImpl: g.fetchImpl, withToken })).toEqual({
      state: "publishing",
      counted: false,
    });
    expect(repo.finish).not.toHaveBeenCalled();
  });

  it("a finish that fails reports the delivery's stored state, or publishing when it cannot be read", async () => {
    repo.finish.mockRejectedValueOnce(new Error("db down"));
    const g = google([review(BODY)]);
    expect(await runPublish(input, { repository: repo, fetchImpl: g.fetchImpl, withToken })).toEqual({
      state: "publishing",
      counted: false,
    });
    expect(repo.getDelivery).toHaveBeenCalledWith(DELIVERY);
  });

  it("an unexpected error before any PUT is failed provider_unavailable", async () => {
    const failing = async () => {
      throw new Error("token_unreadable");
    };
    expect(await runPublish(input, { repository: repo, fetchImpl: google([]).fetchImpl, withToken: failing })).toEqual({
      state: "failed",
      counted: false,
      reason: "provider_unavailable",
    });
    expect(repo.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed", reason: "provider_unavailable" }));
  });
});
