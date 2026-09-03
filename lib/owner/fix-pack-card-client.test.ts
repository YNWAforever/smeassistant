import { afterEach, describe, expect, it, vi } from "vitest";
import { listDrafts, reviewDraft } from "./fix-pack-card-client";

afterEach(() => vi.unstubAllGlobals());

const DRAFT = {
  id: "run-1",
  jobId: "job-1",
  businessName: "Demo Cafe",
  findingLabel: "Google 評分偏低",
  agentKey: "review_reply_agent",
  status: "draft",
  draftText: "多謝支持！",
  reviewExcerpt: "great coffee",
  reviewRating: 5,
  createdAt: "2026-08-20T00:00:00.000Z",
};

describe("listDrafts", () => {
  it("fetches the workspace's drafts with the locale", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ drafts: [DRAFT] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listDrafts("ws-1", "zh-HK");

    expect(result).toEqual({ ok: true, drafts: [DRAFT] });
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/ws-1/fix-pack-drafts?locale=zh-HK");
  });

  it("reports failure without raw server text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unavailable" }), { status: 500 })));
    expect(await listDrafts("ws-1", "en")).toEqual({ ok: false });
  });

  it("reports failure when the network call throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await listDrafts("ws-1", "en")).toEqual({ ok: false });
  });
});

describe("reviewDraft", () => {
  it("patches the run with the chosen status", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await reviewDraft("ws-1", "run-1", "approved");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/ws-1/fix-pack-drafts/run-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "approved" }) }),
    );
  });

  it("reports failure on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "already reviewed" }), { status: 409 })));
    expect(await reviewDraft("ws-1", "run-1", "rejected")).toEqual({ ok: false });
  });
});
