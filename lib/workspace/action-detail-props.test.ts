import { beforeEach, describe, expect, it, vi } from "vitest"

const getAction = vi.fn()
vi.mock("@/lib/workspace/queries-pages", () => ({ getAction: (...a: unknown[]) => getAction(...a), getActivity: vi.fn() }))

import { loadActionDetailProps } from "@/lib/workspace/action-detail-props"
import type { OwnerPageContext } from "@/lib/workspace/page-context"

const page = { ctx: { workspace: { id: "w" } } } as unknown as OwnerPageContext

describe("loadActionDetailProps", () => {
  beforeEach(() => getAction.mockReset())

  it.each(["not-a-uuid", "1", "00000000-0000-4000-8000-00000000000g", "' or 1=1"])("is null for %j without reading", async (id) => {
    await expect(loadActionDetailProps(page, id, null)).resolves.toBeNull()
    expect(getAction).not.toHaveBeenCalled()
  })

  it("reads a UUID and is null when the action is not in this workspace", async () => {
    getAction.mockResolvedValue(null)
    await expect(loadActionDetailProps(page, "00000000-0000-4000-8000-000000000000", null)).resolves.toBeNull()
    expect(getAction).toHaveBeenCalledWith(page.ctx, "00000000-0000-4000-8000-000000000000")
  })
})
