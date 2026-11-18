import { describe, expect, it, vi } from "vitest";

import { InstagramGraphError } from "@/lib/oauth/instagram-graph";
import { InstagramConnectionError } from "./instagram-connection";
import { pullInstagramInsights, type PullInstagramInsightsDeps } from "./instagram-insights-pull";

const WORKSPACE = "2f1c1f80-0000-4000-8000-000000000001";
const ACCOUNT = { id: "17841400000000000", username: "kinnso.demo" };

type InsertRow = { scope: string; mediaRef: string | null; metric: string; value: number | null; unavailableReason: string | null };

function setup(overrides: {
  graph?: {
    getAccountInsights?: (token: string, ig: string, input: unknown) => Promise<Array<{ metric: string; period: string | null; endTime: string | null; value: number | null }>>;
    getMediaInsights?: (token: string, mediaId: string, metrics: readonly string[]) => Promise<Array<{ metric: string; period: string | null; endTime: string | null; value: number | null }>>;
    listRecentMedia?: (token: string, ig: string, options: unknown) => Promise<Array<{ id: string; permalink: string | null; timestamp: string | null; caption: string | null }>>;
  };
  token?: "ok" | "connection_missing" | "connection_expired" | "unauthorized";
  retention?: "ok" | "throw";
}) {
  const inserted: InsertRow[][] = [];
  const deleteOlderThan = vi.fn(async () => {
    if (overrides.retention === "throw") throw new Error("prune failed");
    return 2;
  });
  const repository = {
    insertMany: vi.fn(async (_workspaceId: string, rows: InsertRow[]) => {
      inserted.push(rows);
      return rows.length;
    }),
    deleteOlderThan,
  };
  const deps: PullInstagramInsightsDeps = {
    repository,
    now: () => Date.UTC(2026, 10, 18, 12, 0, 0),
    graph: {
      getAccountInsights: overrides.graph?.getAccountInsights ?? (async () => [{ metric: "impressions", period: "day", endTime: "2026-11-17T08:00:00+0000", value: 120 }]),
      getMediaInsights: overrides.graph?.getMediaInsights ?? (async () => [{ metric: "likes", period: "lifetime", endTime: null, value: 9 }]),
      listRecentMedia: overrides.graph?.listRecentMedia ?? (async () => [{ id: "media-1", permalink: null, timestamp: null, caption: null }]),
    },
    withToken: (async (_workspaceId: string, fn: (token: string, account: typeof ACCOUNT) => Promise<unknown>) => {
      if (overrides.token === "connection_missing") throw new InstagramConnectionError("connection_missing");
      if (overrides.token === "connection_expired") throw new InstagramConnectionError("connection_expired");
      if (overrides.token === "unauthorized") throw new InstagramGraphError("unauthorized", 190);
      return fn("token", ACCOUNT);
    }) as unknown as PullInstagramInsightsDeps["withToken"],
  };
  return { deps, inserted, deleteOlderThan };
}

describe("pullInstagramInsights", () => {
  it("stores account and per-media observations with the account id and observed time", async () => {
    const { deps, inserted } = setup({});
    const result = await pullInstagramInsights({ workspaceId: WORKSPACE }, deps);

    expect(result).toEqual({
      ok: true,
      accountRef: ACCOUNT.id,
      inserted: expect.any(Number),
      unavailable: expect.any(Number),
      observedAt: "2026-11-18T12:00:00.000Z",
      mediaScanned: 1,
      mediaUnavailable: null,
    });
    const rows = inserted.flat();
    expect(rows).toContainEqual({ accountRef: ACCOUNT.id, scope: "account", mediaRef: null, metric: "impressions", periodStart: null, periodEnd: "2026-11-17T08:00:00+0000", value: 120, unavailableReason: null });
    expect(rows).toContainEqual({ accountRef: ACCOUNT.id, scope: "media", mediaRef: "media-1", metric: "likes", periodStart: null, periodEnd: null, value: 9, unavailableReason: null });
    // Metrics Meta returned nothing for are stored unavailable, never as zero.
    expect(rows.filter((row) => row.scope === "account" && row.metric === "reach")).toEqual([{ accountRef: ACCOUNT.id, scope: "account", mediaRef: null, metric: "reach", periodStart: null, periodEnd: null, value: null, unavailableReason: "no_data" }]);
  });

  it("returns the connection reason and writes nothing when the token helper refuses", async () => {
    const { deps, inserted } = setup({ token: "connection_missing" });
    await expect(pullInstagramInsights({ workspaceId: WORKSPACE }, deps)).resolves.toEqual({ ok: false, reason: "connection_missing" });
    expect(inserted).toHaveLength(0);

    const expired = setup({ token: "connection_expired" });
    await expect(pullInstagramInsights({ workspaceId: WORKSPACE }, expired.deps)).resolves.toEqual({ ok: false, reason: "connection_expired" });
  });

  it("records missing permission per metric instead of failing the pull", async () => {
    const { deps, inserted } = setup({
      graph: {
        getAccountInsights: async () => { throw new InstagramGraphError("forbidden", 10); },
        listRecentMedia: async () => { throw new InstagramGraphError("forbidden", 10); },
      },
    });
    const result = await pullInstagramInsights({ workspaceId: WORKSPACE }, deps);

    expect(result).toMatchObject({ ok: true, mediaScanned: 0, mediaUnavailable: "missing_permission" });
    const rows = inserted.flat();
    expect(rows.filter((row) => row.scope === "account")).toHaveLength(3);
    expect(rows.filter((row) => row.scope === "account").every((row) => row.value === null && row.unavailableReason === "missing_permission")).toBe(true);
  });

  it("prunes observations older than the decided 12 months after storing, without failing the pull", async () => {
    const { deps, deleteOlderThan } = setup({});
    await expect(pullInstagramInsights({ workspaceId: WORKSPACE }, deps)).resolves.toMatchObject({ ok: true });
    expect(deleteOlderThan).toHaveBeenCalledWith(WORKSPACE, "2025-11-18T12:00:00.000Z");

    const failing = setup({ retention: "throw" });
    await expect(pullInstagramInsights({ workspaceId: WORKSPACE }, failing.deps)).resolves.toMatchObject({ ok: true });
  });

  it("lets an unauthorized error escape so the token helper can refresh or expire the row", async () => {
    const { deps, inserted } = setup({
      graph: { getAccountInsights: async () => { throw new InstagramGraphError("unauthorized", 190); } },
    });
    await expect(pullInstagramInsights({ workspaceId: WORKSPACE }, deps)).rejects.toMatchObject({ code: "unauthorized" });
    expect(inserted).toHaveLength(0);
  });
});
