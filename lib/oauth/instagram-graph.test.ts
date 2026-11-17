import { describe, expect, it, vi } from "vitest";

import {
  InstagramGraphError,
  createMediaContainer,
  getMediaContainerStatus,
  getPublishedMedia,
  publishMediaContainer,
  type InstagramGraphTransport,
} from "./instagram-graph";

const TOKEN = "IGQVJtoken-PLAINTEXT";
const IG_USER = "17841400000000000";
const IMAGE = "https://cdn.example.com/posts/today.jpg";
const CAPTION = "Fresh from the kitchen today.";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function graphError(code: number, message = "provider said no"): Response {
  return json({ error: { message, type: "OAuthException", code } }, 400);
}

/** A transport that records what was sent and answers with the given handler. */
function transport(handler: (url: URL, init: RequestInit) => Response): { transport: InstagramGraphTransport; calls: Array<{ url: URL; init: RequestInit }> } {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  return {
    calls,
    transport: {
      fetch: (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = new URL(String(input));
        calls.push({ url, init });
        return handler(url, init);
      }) as unknown as typeof fetch,
    },
  };
}

describe("createMediaContainer", () => {
  it("posts the image URL and caption to the account's media edge", async () => {
    const { transport: t, calls } = transport(() => json({ id: "container-1" }));

    await expect(createMediaContainer(TOKEN, IG_USER, { imageUrl: IMAGE, caption: CAPTION }, { transport: t })).resolves.toBe("container-1");

    expect(calls).toHaveLength(1);
    expect(calls[0].url.pathname.endsWith(`/${IG_USER}/media`)).toBe(true);
    expect(calls[0].init.method).toBe("POST");
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(body.get("image_url")).toBe(IMAGE);
    expect(body.get("caption")).toBe(CAPTION);
    expect(body.get("access_token")).toBe(TOKEN);
  });

  it("throws a content-free error carrying Meta's numeric code", async () => {
    const { transport: t } = transport(() => graphError(190, "Error validating access token"));
    await expect(createMediaContainer(TOKEN, IG_USER, { imageUrl: IMAGE, caption: CAPTION }, { transport: t })).rejects.toMatchObject({
      code: "unauthorized",
      graphCode: 190,
    });
  });
});

describe("error taxonomy", () => {
  const cases: Array<[number, number, string]> = [
    [401, 0, "unauthorized"],
    [400, 190, "unauthorized"],
    [400, 10, "forbidden"],
    [403, 0, "forbidden"],
    [400, 4, "rate_limited"],
    [429, 0, "rate_limited"],
    [400, 9004, "media_url_unreachable"],
    [400, 36000, "media_url_unreachable"],
    [400, 9007, "already_published"],
    [404, 803, "not_found"],
    [500, 1, "provider_unavailable"],
  ];

  it.each(cases)("maps HTTP %s / code %s to %s", async (status, code, expected) => {
    // `graphError` always answers 400; a 5xx case needs the status kept.
    const { transport: t } = transport(() =>
      status === 400 ? graphError(code) : json({ error: { message: "server error", code } }, status),
    );
    await expect(
      createMediaContainer(TOKEN, IG_USER, { imageUrl: IMAGE, caption: CAPTION }, { transport: t }),
    ).rejects.toMatchObject({ code: expected });
  });

  it("maps a transport failure to provider_unavailable without leaking the URL", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { transport: t } = transport(() => {
        throw new Error(`fetch failed for ${IMAGE}`);
      });
      await expect(createMediaContainer(TOKEN, IG_USER, { imageUrl: IMAGE, caption: CAPTION }, { transport: t })).rejects.toMatchObject({
        code: "provider_unavailable",
      });
      expect(JSON.stringify(error.mock.calls)).not.toContain(IMAGE);
      expect(JSON.stringify(error.mock.calls)).not.toContain(TOKEN);
    } finally {
      error.mockRestore();
    }
  });

  it("rejects a 200 answer without an id instead of inventing one", async () => {
    const { transport: t } = transport(() => json({}));
    await expect(createMediaContainer(TOKEN, IG_USER, { imageUrl: IMAGE, caption: CAPTION }, { transport: t })).rejects.toBeInstanceOf(
      InstagramGraphError,
    );
  });
});

describe("getMediaContainerStatus", () => {
  it.each([
    ["IN_PROGRESS", "in_progress"],
    ["FINISHED", "finished"],
    ["ERROR", "error"],
    ["EXPIRED", "expired"],
    ["PUBLISHED", "published"],
  ])("maps %s to %s", async (raw, expected) => {
    const { transport: t, calls } = transport(() => json({ status_code: raw }));
    await expect(getMediaContainerStatus(TOKEN, "container-1", { transport: t })).resolves.toBe(expected);
    expect(calls[0].url.searchParams.get("fields")).toBe("status_code");
    expect(calls[0].url.searchParams.get("access_token")).toBe(TOKEN);
  });

  it("refuses an unrecognised status rather than guessing", async () => {
    const { transport: t } = transport(() => json({ status_code: "SOMETHING_NEW" }));
    await expect(getMediaContainerStatus(TOKEN, "container-1", { transport: t })).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});

describe("publishMediaContainer", () => {
  it("posts the container id and returns Meta's media id", async () => {
    const { transport: t, calls } = transport(() => json({ id: "media-1" }));

    await expect(publishMediaContainer(TOKEN, IG_USER, "container-1", { transport: t })).resolves.toBe("media-1");
    expect(calls[0].url.pathname.endsWith(`/${IG_USER}/media_publish`)).toBe(true);
    expect(String(calls[0].init.body)).toContain("creation_id=container-1");
  });

  it("surfaces a second publish of the same container as already_published", async () => {
    const { transport: t } = transport(() => graphError(9007, "Media has been published"));
    await expect(publishMediaContainer(TOKEN, IG_USER, "container-1", { transport: t })).rejects.toMatchObject({
      code: "already_published",
    });
  });
});

describe("getPublishedMedia", () => {
  it("reads the permalink back for the receipt", async () => {
    const { transport: t } = transport(() =>
      json({ id: "media-1", permalink: "https://www.instagram.com/p/abc/", timestamp: "2026-11-18T00:00:00+0000" }),
    );
    await expect(getPublishedMedia(TOKEN, "media-1", { transport: t })).resolves.toEqual({
      id: "media-1",
      permalink: "https://www.instagram.com/p/abc/",
      timestamp: "2026-11-18T00:00:00+0000",
    });
  });
});
