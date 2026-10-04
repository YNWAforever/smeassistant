// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { GbpPublishCard, type GbpPublishCardProps } from "@/components/workspace/gbp-publish-card"
import { copy } from "@/lib/copy"
import type { PublishPanel } from "@/lib/publishing/page-state"

const text = copy.en.workspace.publish
const VERSION = "22222222-2222-4222-8222-222222222222"
const OTHER_VERSION = "33333333-3333-4333-8333-333333333333"
const BODY = "Thank you for the kind words about our milk tea. We hope to see you again soon."
const REVIEW_A = "accounts/1/locations/2/reviews/a"
const REVIEW_B = "accounts/1/locations/2/reviews/b"

const TARGETS = {
  targets: [
    { reviewName: REVIEW_A, reviewer: "Chan Tai Man", starRating: 5, createTime: "2026-10-03T08:00:00Z", excerpt: "Lovely milk tea" },
    { reviewName: REVIEW_B, reviewer: "Lee Siu Ming", starRating: 2, createTime: "2026-10-01T08:00:00Z", excerpt: "Slow service" },
  ],
  preselected: REVIEW_B,
}

function panel(overrides: Partial<PublishPanel> = {}): PublishPanel {
  return {
    enabled: true,
    connectionActive: true,
    eligibility: { ok: true },
    canPublish: true,
    canDelete: true,
    deliveries: [],
    ...overrides,
  }
}

const onChanged = vi.fn()

function mount(overrides: Partial<GbpPublishCardProps> = {}) {
  return render(
    <GbpPublishCard
      locale="en"
      versionId={VERSION}
      versionNo={3}
      body={BODY}
      approved
      panel={panel()}
      workspaceSlug="kam-man-house"
      timezone="Asia/Hong_Kong"
      onChanged={onChanged}
      {...overrides}
    />,
  )
}

const ok = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))

type FetchCall = [string, RequestInit | undefined]
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
const calls = (): FetchCall[] => fetchMock.mock.calls as FetchCall[]
const posts = () => calls().filter(([url, init]) => url.endsWith("/publish") && init?.method === "POST")
const postBody = (index: number) => JSON.parse(String(posts()[index][1]?.body)) as { reviewName: string; idempotencyKey: string; confirmVersionNo: number }

async function openDialog() {
  fetchMock.mockImplementationOnce(() => ok(TARGETS))
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.publishButton })) })
  await screen.findByRole("dialog")
}

function confirmButton() {
  return within(screen.getByRole("dialog")).getByRole("button", { name: text.publishConfirm })
}

async function check() {
  await act(async () => { fireEvent.click(screen.getByRole("checkbox", { name: text.confirm })) })
}

describe("GbpPublishCard", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    onChanged.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("renders nothing when disabled with no deliveries", () => {
    const { container } = mount({ panel: panel({ enabled: false, connectionActive: false, eligibility: { ok: false, reason: "flag_off" }, canPublish: false, canDelete: false }) })
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("Publish is disabled until a review is selected and the confirmation is checked", async () => {
    mount()
    fetchMock.mockImplementationOnce(() => ok({ targets: TARGETS.targets, preselected: null }))
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.publishButton })) })
    await screen.findByText(/Chan Tai Man/)
    expect(calls()[0][0]).toBe(`/api/versions/${VERSION}/publish/targets`)
    // The full approved body, read-only, with its exact version.
    expect(screen.getByText(text.versionLabel.replace("{n}", "3"))).toBeInTheDocument()
    const bodyField = screen.getByRole("textbox", { name: text.versionLabel.replace("{n}", "3") })
    expect(bodyField).toHaveValue(BODY)
    expect(bodyField).toHaveAttribute("readonly")

    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /Chan Tai Man/ })) })
    expect(confirmButton()).toBeDisabled()
    await check()
    expect(confirmButton()).toBeEnabled()
    expect(screen.getByText(text.confirm)).toBeInTheDocument()
    expect(text.confirm).toBe("I confirm this exact approved version will be posted publicly as the owner's reply to the selected review.")
  })

  it("preselected review is checked", async () => {
    mount()
    await openDialog()
    await screen.findByText(/Lee Siu Ming/)
    expect(screen.getByRole("radio", { name: /Lee Siu Ming/ })).toBeChecked()
    expect(screen.getByRole("radio", { name: /Chan Tai Man/ })).not.toBeChecked()
    // Stars, reviewer, date and excerpt are shown for each target.
    expect(screen.getByText("Slow service")).toBeInTheDocument()
    expect(screen.getByLabelText(text.stars.replace("{n}", "2"))).toBeInTheDocument()
  })

  it("posts reviewName, idempotencyKey and confirmVersionNo; reuses the key on retry", async () => {
    mount()
    await openDialog()
    await screen.findByText(/Lee Siu Ming/)
    await check()
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")))
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(await screen.findByRole("alert")).toHaveTextContent(text.reasons.network)
    expect(onChanged).not.toHaveBeenCalled()

    fetchMock.mockImplementationOnce(() => ok({ deliveryId: "d-1", state: "published", counted: true, usage: null }))
    await act(async () => { fireEvent.click(confirmButton()) })
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))

    expect(posts()).toHaveLength(2)
    expect(posts()[0][0]).toBe(`/api/versions/${VERSION}/publish`)
    const first = postBody(0)
    expect(first).toEqual({ reviewName: REVIEW_B, idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/), confirmVersionNo: 3 })
    expect(postBody(1).idempotencyKey).toBe(first.idempotencyKey)
    // A finished publish closes the dialog.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("changing the selected review mints a new key", async () => {
    mount()
    await openDialog()
    await screen.findByText(/Lee Siu Ming/)
    await check()
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")))
    await act(async () => { fireEvent.click(confirmButton()) })
    await screen.findByRole("alert")
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /Chan Tai Man/ })) })
    await act(async () => { fireEvent.click(confirmButton()) })
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /Lee Siu Ming/ })) })
    await act(async () => { fireEvent.click(confirmButton()) })

    expect(posts()).toHaveLength(3)
    const [a, b, c] = [postBody(0), postBody(1), postBody(2)]
    expect(a.reviewName).toBe(REVIEW_B)
    expect(b.reviewName).toBe(REVIEW_A)
    expect(c.reviewName).toBe(REVIEW_B)
    expect(new Set([a.idempotencyKey, b.idempotencyKey, c.idempotencyKey]).size).toBe(3)
  })

  it("a failed result mints a new key for the next attempt in the same dialog", async () => {
    mount()
    await openDialog()
    await screen.findByText(/Lee Siu Ming/)
    await check()
    fetchMock.mockImplementationOnce(() => ok({ deliveryId: "d-1", state: "failed", counted: false, reason: "provider_unavailable", usage: null }))
    await act(async () => { fireEvent.click(confirmButton()) })
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("alert")).toHaveTextContent(text.reasons.provider_unavailable)
    fetchMock.mockImplementationOnce(() => ok({ deliveryId: "d-2", state: "published", counted: true, usage: null }))
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(postBody(1).idempotencyKey).not.toBe(postBody(0).idempotencyKey)
  })

  it("uncertain state shows Check on Google and calls reconcile", async () => {
    const createdAt = new Date().toISOString()
    mount({ panel: panel({ deliveries: [{ id: "d-9", versionId: VERSION, state: "publishing", reason: null, verifiedAt: null, createdAt }] }) })
    expect(screen.getByText(text.state.publishing)).toBeInTheDocument()
    expect(text.state.publishing).toBe("We couldn't confirm Google received it. Nothing will be sent again automatically.")
    // A fresh uncertain row is not reconciled on mount, and Publish is not offered while it stands.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: text.publishButton })).not.toBeInTheDocument()

    fetchMock.mockImplementationOnce(() => ok({ deliveryId: "d-9", state: "publishing", counted: false, reason: "too_soon" }))
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.checkOnGoogle })) })
    expect(calls()[0][0]).toBe("/api/deliveries/d-9/reconcile")
    expect(calls()[0][1]?.method).toBe("POST")
    expect(await screen.findByRole("status")).toHaveTextContent(text.reasons.too_soon)

    fetchMock.mockImplementationOnce(() => ok({ deliveryId: "d-9", state: "published", counted: true }))
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.checkOnGoogle })) })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it("reconciles once on mount for a publishing delivery older than 15 s", async () => {
    const old = new Date(Date.now() - 60_000).toISOString()
    const fresh = new Date().toISOString()
    fetchMock.mockImplementation(() => ok({ deliveryId: "d-old", state: "failed", counted: false, reason: "not_applied" }))
    const deliveries: PublishPanel["deliveries"] = [
      { id: "d-old", versionId: VERSION, state: "publishing", reason: null, verifiedAt: null, createdAt: old },
      { id: "d-fresh", versionId: VERSION, state: "publishing", reason: null, verifiedAt: null, createdAt: fresh },
      { id: "d-done", versionId: OTHER_VERSION, state: "failed", reason: "not_applied", verifiedAt: null, createdAt: old },
    ]
    const view = mount({ panel: panel({ deliveries }) })
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(calls().map(([url]) => url)).toEqual(["/api/deliveries/d-old/reconcile"])
    // A re-render with the same rows (router.refresh) does not reconcile again.
    view.rerender(
      <GbpPublishCard locale="en" versionId={VERSION} versionNo={3} body={BODY} approved panel={panel({ deliveries })} workspaceSlug="kam-man-house" timezone="Asia/Hong_Kong" onChanged={onChanged} />,
    )
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("Delete reply only for owners and asks for confirmation", async () => {
    const published: PublishPanel["deliveries"] = [
      { id: "d-1", versionId: VERSION, state: "published", reason: null, verifiedAt: "2026-10-04T02:00:00.000Z", createdAt: "2026-10-04T01:59:00.000Z" },
    ]
    const { unmount } = mount({ panel: panel({ canDelete: false, deliveries: published }) })
    expect(screen.getByText(text.state.published)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: text.deleteReply })).not.toBeInTheDocument()
    unmount()

    mount({ panel: panel({ deliveries: published }) })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.deleteReply })) })
    // Nothing is sent until the owner confirms.
    expect(fetchMock).not.toHaveBeenCalled()
    const confirm = await screen.findByRole("alertdialog")
    expect(confirm).toHaveTextContent(text.deleteConfirm)
    fetchMock.mockImplementationOnce(() => ok({ state: "cancelled" }))
    await act(async () => { fireEvent.click(within(confirm).getByRole("button", { name: text.deleteReply })) })
    expect(calls()[0][0]).toBe("/api/deliveries/d-1/reply")
    expect(calls()[0][1]?.method).toBe("DELETE")
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it("connection_missing shows the integrations link", () => {
    mount({ panel: panel({ connectionActive: false, eligibility: { ok: false, reason: "connection_missing" }, canPublish: false }) })
    const link = screen.getByRole("link", { name: text.connectGoogle })
    expect(link).toHaveAttribute("href", "/en/owner/kam-man-house/settings/integrations")
    expect(screen.queryByRole("button", { name: text.publishButton })).not.toBeInTheDocument()
  })

  it("failed and deleted states show their copy, and publishing again is offered", () => {
    const { unmount } = mount({ panel: panel({ deliveries: [{ id: "d-1", versionId: VERSION, state: "failed", reason: "review_not_found", verifiedAt: null, createdAt: "2026-10-04T01:00:00.000Z" }] }) })
    expect(screen.getByText(text.state.failed)).toBeInTheDocument()
    expect(screen.getByText(text.reasons.review_not_found)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: text.publishButton })).toBeInTheDocument()
    unmount()
    mount({ panel: panel({ deliveries: [{ id: "d-1", versionId: VERSION, state: "cancelled", reason: null, verifiedAt: null, createdAt: "2026-10-04T01:00:00.000Z" }] }) })
    expect(screen.getByText(text.state.cancelled)).toBeInTheDocument()
  })

  it("viewers and unapproved versions are never offered Publish", () => {
    const { unmount } = mount({ panel: panel({ canPublish: false, canDelete: false }) })
    expect(screen.queryByRole("button", { name: text.publishButton })).not.toBeInTheDocument()
    unmount()
    const { container } = mount({ approved: false })
    expect(container).toBeEmptyDOMElement()
  })

  it("zh-HK and zh-TW render their own strings", () => {
    for (const locale of ["zh-HK", "zh-TW"] as const) {
      const t = copy[locale].workspace.publish
      expect(t.confirm).not.toBe(text.confirm)
      const { unmount } = mount({ locale, panel: panel({ deliveries: [{ id: "d-1", versionId: VERSION, state: "publishing", reason: null, verifiedAt: null, createdAt: new Date().toISOString() }] }) })
      expect(screen.getByText(t.state.publishing)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: t.checkOnGoogle })).toBeInTheDocument()
      unmount()
    }
    expect(copy["zh-TW"].workspace.publish.confirm).not.toBe(copy["zh-HK"].workspace.publish.confirm)
  })
})
