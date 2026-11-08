import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const assets = vi.fn()
vi.mock("@/lib/repositories/assets", () => ({ assetRepository: () => ({ list: assets }) }))
vi.mock("@/lib/repositories/brand", () => ({ brandRepository: () => ({ get: async () => null }) }))
vi.mock("@/lib/repositories/workspace-read", () => ({ workspaceReadRepository: () => ({
  latestConnection: async () => null,
  effortSignals: async () => ({ approved: 0, delivered: 0, completed: 0, active_weeks: [], this_week: "2026-10-26" }),
}) }))
vi.mock("@/lib/workspace/assets", () => ({ signedUrlFor: async (path: string) => `https://blob.example/${path}` }))

import { loadTodayProgress } from "./progress-loader"
import type { WorkspaceContext } from "./queries"

const ctx = { workspace: { id: "ws", timezone: "Asia/Hong_Kong", instagramHandle: null } } as unknown as WorkspaceContext
const photo = (id: string, location_id: string | null) => ({ id, location_id, kind: "image", rights_status: "approved", storage_path: `ws/${id}/a.jpg`, alt_text: id })

describe("loadTodayProgress photos", () => {
  beforeEach(() => assets.mockResolvedValue([photo("other", "loc-b"), photo("shared", null), photo("mine", "loc-a")]))

  it("shows workspace-wide photos plus the selected location's, never another location's", async () => {
    const { photos } = await loadTodayProgress(ctx, { monthDone: 0, open: 0, locationId: "loc-a" })
    expect(photos.map((p) => p.id)).toEqual(["shared", "mine"])
  })

  it("shows every location's photos for all locations", async () => {
    const { photos } = await loadTodayProgress(ctx, { monthDone: 0, open: 0, locationId: "all" })
    expect(photos.map((p) => p.id)).toEqual(["other", "shared", "mine"])
  })
})
