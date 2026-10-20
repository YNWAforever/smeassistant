// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ approve: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock("@/lib/workspace/client", () => ({ approveVersion: mocks.approve }))

import { BulkApprove } from "./bulk-approve"

afterEach(() => { cleanup(); vi.clearAllMocks() })
const items = [
  { actionId: "a1", versionId: "v1", versionNo: 2, title: { en: "Reply to Mei", "zh-HK": "回覆 Mei", "zh-TW": "回覆 Mei" }, body: "Thank you, Mei!" },
  { actionId: "a2", versionId: "v2", versionNo: 1, title: { en: "Reply to Ken", "zh-HK": "回覆 Ken", "zh-TW": "回覆 Ken" }, body: "Thanks, Ken." },
]

it("renders nothing without safe drafts", () => {
  const { container } = render(<BulkApprove locale="en" items={[]} />)
  expect(container.innerHTML).toBe("")
})

it("shows each draft's full text and approves only the drafts ticked as read, one at a time", async () => {
  mocks.approve.mockResolvedValueOnce({ ok: true, data: {} })
  render(<BulkApprove locale="en" items={items} />)
  expect(screen.getByRole("heading", { name: "2 drafts ready to approve" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Review and approve" }))
  expect(screen.getByText("Thank you, Mei!")).toBeTruthy()
  expect(screen.getByText("Thanks, Ken.")).toBeTruthy()
  const approve = screen.getByRole("button", { name: "Approve 0 selected" })
  expect(approve).toBeDisabled()
  fireEvent.click(screen.getAllByRole("checkbox")[0])
  fireEvent.click(screen.getByRole("button", { name: "Approve 1 selected" }))
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  expect(mocks.approve).toHaveBeenCalledTimes(1)
  expect(mocks.approve).toHaveBeenCalledWith("v1")
  expect(screen.getByText("Approved")).toBeTruthy()
  expect(screen.getByRole("status").textContent).toBe("1 of 2 approved")
})

it("reports a refused approval on that draft and keeps it unapproved", async () => {
  mocks.approve.mockResolvedValueOnce({ ok: false, status: 409, error: "version_closed" })
  render(<BulkApprove locale="zh-HK" items={[items[0]]} />)
  fireEvent.click(screen.getByRole("button", { name: "審閱並審批" }))
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(screen.getByRole("button", { name: "審批已選的 1 份" }))
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("未能審批"))
  expect(screen.queryByText("已審批")).toBeNull()
})
