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
  const view = render(<BulkApprove locale="en" items={items} />)
  expect(screen.getByRole("heading", { name: "Drafts ready to confirm: 2" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Read and confirm" }))
  expect(screen.getByText("Thank you, Mei!")).toBeTruthy()
  expect(screen.getByText("Thanks, Ken.")).toBeTruthy()
  const approve = screen.getByRole("button", { name: "Approve 0 selected" })
  expect(approve).toBeDisabled()
  fireEvent.click(screen.getAllByRole("checkbox")[0])
  fireEvent.click(screen.getByRole("button", { name: "Approve 1 selected" }))
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("1 of 2 approved"))
  expect(mocks.approve).toHaveBeenCalledTimes(1)
  expect(mocks.approve).toHaveBeenCalledWith("v1")
  expect(screen.getByText("Approved")).toBeTruthy()
  // The page refreshes only when the dialog closes, so the results stay put meanwhile.
  expect(mocks.refresh).not.toHaveBeenCalled()
  view.rerender(<BulkApprove locale="en" items={[items[1]]} />)
  expect(screen.getByRole("status").textContent).toBe("1 of 2 approved")
  expect(screen.getByText("Thank you, Mei!")).toBeTruthy()
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0])
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
})

it("keeps the results of a fully successful run visible until the dialog closes", async () => {
  mocks.approve.mockResolvedValue({ ok: true, data: {} })
  const view = render(<BulkApprove locale="en" items={items} />)
  fireEvent.click(screen.getByRole("button", { name: "Read and confirm" }))
  for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box)
  fireEvent.click(screen.getByRole("button", { name: "Approve 2 selected" }))
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 of 2 approved"))
  view.rerender(<BulkApprove locale="en" items={[]} />)
  expect(screen.getByRole("status").textContent).toBe("2 of 2 approved")
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0])
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
})

it("does not refresh when the dialog closes without an approval", () => {
  render(<BulkApprove locale="en" items={items} />)
  fireEvent.click(screen.getByRole("button", { name: "Read and confirm" }))
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0])
  expect(mocks.refresh).not.toHaveBeenCalled()
})

it("reports a refused approval on that draft and keeps it unapproved", async () => {
  mocks.approve.mockResolvedValueOnce({ ok: false, status: 409, error: "version_closed" })
  render(<BulkApprove locale="zh-HK" items={[items[0]]} />)
  fireEvent.click(screen.getByRole("button", { name: "逐份睇再確認" }))
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(screen.getByRole("button", { name: "確認已選的 1 份" }))
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("未能確認"))
  expect(screen.queryByText("已確認")).toBeNull()
})
