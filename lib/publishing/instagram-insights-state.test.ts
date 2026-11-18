import { beforeEach, describe, expect, it, vi } from "vitest"

const { insightsRepo, connectionRepo } = vi.hoisted(() => ({
  insightsRepo: { listLatest: vi.fn() },
  connectionRepo: { activeConnection: vi.fn() },
}))

vi.mock("@/lib/repositories/instagram-insights", () => ({ instagramInsightsRepository: () => insightsRepo }))
vi.mock("@/lib/repositories/instagram-connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/instagram-connection")>()
  return { ...actual, instagramConnectionRepository: () => connectionRepo }
})

import { loadInstagramInsightsPanel } from "./instagram-insights-state"

const WORKSPACE = "2f1c1f80-0000-4000-8000-000000000001"
const CONNECTION = {
  id: "connection-1",
  status: "active",
  scopes: ["instagram_basic", "instagram_manage_insights"],
  accessTokenEncrypted: "sealed",
  refreshTokenEncrypted: null,
  expiresAt: null,
  accountRef: JSON.stringify({ id: "17841400000000000", username: "kinnso.demo" }),
  updatedAt: null,
};

beforeEach(() => {
  insightsRepo.listLatest.mockReset()
  connectionRepo.activeConnection.mockReset()
})

describe("loadInstagramInsightsPanel", () => {
  it("returns null without any SQL while the flag is off", async () => {
    await expect(loadInstagramInsightsPanel({ workspaceId: WORKSPACE })).resolves.toBeNull();
    expect(insightsRepo.listLatest).not.toHaveBeenCalled();
    expect(connectionRepo.activeConnection).not.toHaveBeenCalled();
  })

  it("returns stored observations and whether the connection still has insights access", async () => {
    insightsRepo.listLatest.mockResolvedValue([
      { id: "row-1", workspaceId: WORKSPACE, accountRef: "17841400000000000", scope: "account", mediaRef: null, metric: "impressions", periodStart: null, periodEnd: "2026-11-17T08:00:00+0000", value: 120, unavailableReason: null, observedAt: "2026-11-18T00:00:00.000Z" },
      { id: "row-2", workspaceId: WORKSPACE, accountRef: "17841400000000000", scope: "account", mediaRef: null, metric: "reach", periodStart: null, periodEnd: null, value: null, unavailableReason: "no_data", observedAt: "2026-11-17T00:00:00.000Z" },
    ]);
    connectionRepo.activeConnection.mockResolvedValue(CONNECTION);

    const panel = await loadInstagramInsightsPanel({ workspaceId: WORKSPACE, enabled: true });
    expect(panel).toEqual({
      enabled: true,
      connectionActive: true,
      observedAt: "2026-11-18T00:00:00.000Z",
      values: [
        { scope: "account", mediaRef: null, metric: "impressions", periodEnd: "2026-11-17T08:00:00+0000", value: 120, factType: "Observed", unavailableReason: null, observedAt: "2026-11-18T00:00:00.000Z" },
        { scope: "account", mediaRef: null, metric: "reach", periodEnd: null, value: null, factType: "Observed", unavailableReason: "no_data", observedAt: "2026-11-17T00:00:00.000Z" },
      ],
    });
  })

  it("marks the connection inactive when the insights scope is no longer granted", async () => {
    insightsRepo.listLatest.mockResolvedValue([]);
    connectionRepo.activeConnection.mockResolvedValue({ ...CONNECTION, scopes: ["instagram_basic", "instagram_content_publish"] });
    const panel = await loadInstagramInsightsPanel({ workspaceId: WORKSPACE, enabled: true });
    expect(panel?.connectionActive).toBe(false);
    expect(panel?.observedAt).toBeNull();
  })

  it("hides the panel instead of failing the page when a read fails", async () => {
    insightsRepo.listLatest.mockRejectedValue(new Error("db down"));
    await expect(loadInstagramInsightsPanel({ workspaceId: WORKSPACE, enabled: true })).resolves.toBeNull();
  })
})
