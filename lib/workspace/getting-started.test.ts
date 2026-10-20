import { beforeEach, expect, it, vi } from "vitest"

const repo = vi.hoisted(() => ({
  brand: vi.fn(), connection: vi.fn(), approved: vi.fn(), deliveries: vi.fn(),
}))
vi.mock("@/lib/repositories/brand", () => ({ brandRepository: () => ({ get: repo.brand }) }))
vi.mock("@/lib/repositories/workspace-read", () => ({
  workspaceReadRepository: () => ({ latestConnection: repo.connection, anyApprovedVersion: repo.approved, deliveries: repo.deliveries }),
}))

import { loadGettingStarted } from "./getting-started"
import type { Membership } from "@/lib/auth"
import type { WorkspaceContext } from "@/lib/workspace/queries"

const ctx = (isDemo = false) => ({ workspace: { id: "ws", slug: "kam", isDemo } }) as unknown as WorkspaceContext
const member = (role: Membership["role"]) => ({ role }) as Membership

beforeEach(() => {
  repo.brand.mockResolvedValue(null)
  repo.connection.mockResolvedValue(null)
  repo.approved.mockResolvedValue(false)
  repo.deliveries.mockResolvedValue([])
})

it("derives each step from the workspace's own data, with ownership already done", async () => {
  repo.brand.mockResolvedValue({ voice: "warm" })
  const items = await loadGettingStarted(ctx(), member("owner"), "en")
  expect(items?.map((item) => [item.key, item.done])).toEqual([["ownership", true], ["brand", true], ["google", false], ["approve", false], ["deliver", false]])
  expect(items?.find((item) => item.key === "google")?.href).toBe("/en/owner/kam/business/integrations")
})

it("hides itself once every step is done", async () => {
  repo.brand.mockResolvedValue({ voice: "warm" })
  repo.connection.mockResolvedValue({ status: "active" })
  repo.approved.mockResolvedValue(true)
  repo.deliveries.mockResolvedValue([{ action_id: "a" }])
  expect(await loadGettingStarted(ctx(), member("owner"), "en")).toBeNull()
})

it("gives managers no links to owner-only pages", async () => {
  const items = await loadGettingStarted(ctx(), member("manager"), "en")
  expect(items?.find((item) => item.key === "brand")?.href).toBeNull()
  expect(items?.find((item) => item.key === "google")?.href).toBeNull()
  expect(items?.find((item) => item.key === "approve")?.href).toBe("/en/owner/kam/actions?view=awaiting_approval")
})

it("shows nothing to viewers or on demo workspaces, and nothing rather than a wrong tick when a read fails", async () => {
  expect(await loadGettingStarted(ctx(), member("viewer"), "en")).toBeNull()
  expect(await loadGettingStarted(ctx(true), member("owner"), "en")).toBeNull()
  vi.spyOn(console, "error").mockImplementation(() => {})
  repo.connection.mockRejectedValue(new Error("db"))
  expect(await loadGettingStarted(ctx(), member("owner"), "en")).toBeNull()
})
