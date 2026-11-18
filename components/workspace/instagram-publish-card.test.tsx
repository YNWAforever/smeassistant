// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { InstagramPublishCard, type InstagramPublishCardProps } from "@/components/workspace/instagram-publish-card"
import { copy } from "@/lib/copy"
import type { InstagramPublishPanel, InstagramPublishPanelDelivery } from "@/lib/publishing/page-state"

const text = copy.en.workspace.instagramPublish
const VERSION = "22222222-2222-4222-8222-222222222222"
const BODY = "Fresh milk tea at Kam Man House. Come by before 6pm."
const IMAGE = "https://cdn.example.com/kam-man-house/tea.jpg"

function panel(overrides: Partial<InstagramPublishPanel> = {}): InstagramPublishPanel {
  return {
    enabled: true,
    connectionActive: true,
    templateAllowed: true,
    mayAct: true,
    canPublish: true,
    deliveries: [],
    ...overrides,
  }
}

function receipt(overrides: Partial<InstagramPublishPanelDelivery> = {}): InstagramPublishPanelDelivery {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    versionId: VERSION,
    state: "published",
    reason: null,
    verifiedAt: "2026-11-01T03:00:00.000Z",
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

const onChanged = vi.fn()

function mount(overrides: Partial<InstagramPublishCardProps> = {}) {
  return render(
    <InstagramPublishCard
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
const posts = (suffix: string) => calls().filter(([url, init]) => url.endsWith(suffix) && init?.method === "POST")
const body = (index: number) => JSON.parse(String(posts("/publish-instagram")[index][1]?.body)) as {
  imageUrl: string; idempotencyKey: string; confirmVersionNo: number
}

async function openDialog() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.publishButton })) })
  await screen.findByRole("dialog")
}

function dialogButton(name: string) {
  return within(screen.getByRole("dialog")).getByRole("button", { name })
}

async function fill(url: string) {
  const input = screen.getByLabelText(text.imageUrlLabel)
  await act(async () => { fireEvent.change(input, { target: { value: url } }) })
}

async function confirm() {
  const box = within(screen.getByRole("dialog")).getByRole("checkbox", { name: text.confirm })
  await act(async () => { fireEvent.click(box) })
}

describe("InstagramPublishCard", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    onChanged.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("hides with nothing to show and no permission to publish", () => {
    const { container } = mount({ panel: panel({ enabled: false, connectionActive: false, canPublish: false }) })
    expect(container.innerHTML).toBe("")
  })

  it("shows the published receipt with its verified time and no publish form", () => {
    mount({ panel: panel({ deliveries: [receipt()] }) })
    expect(screen.getByText(text.publishedTitle)).toBeTruthy()
    expect(screen.getByText(new RegExp(text.verifiedAt.replace("{time}", "").trim()))).toBeTruthy()
    expect(screen.queryByRole("button", { name: text.publishButton })).toBeNull()
  })

  it("shows the uncertain receipt and settles it through the reconcile route", async () => {
    fetchMock.mockImplementation(() => ok({ state: "published", settledNow: true }))
    mount({ panel: panel({ deliveries: [receipt({ state: "publishing", reason: null, verifiedAt: null })] }) })
    expect(screen.getByText(text.uncertainTitle)).toBeTruthy()
    expect(screen.getByText(text.uncertainBody)).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.checkStatus })) })
    expect(posts("/reconcile-instagram")).toHaveLength(1)
    expect(posts("/reconcile-instagram")[0][0]).toBe(`/api/deliveries/${receipt().id}/reconcile-instagram`)
    expect(onChanged).toHaveBeenCalled()
  })

  it("does not auto-reconcile a publishing receipt younger than the read-back delay", () => {
    mount({ panel: panel({ deliveries: [receipt({ state: "publishing", verifiedAt: null })] }) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("auto-reconciles an old uncertain receipt once per load", async () => {
    fetchMock.mockImplementation(() => ok({ state: "published", settledNow: true }))
    const old = receipt({ state: "publishing", verifiedAt: null, createdAt: new Date(Date.now() - 120_000).toISOString() })
    mount({ panel: panel({ deliveries: [old] }) })
    await waitFor(() => expect(posts("/reconcile-instagram")).toHaveLength(1))
    expect(onChanged).toHaveBeenCalled()
  })

  it("shows a failed receipt's reason copy and offers a retry", () => {
    mount({ panel: panel({ deliveries: [receipt({ state: "failed", reason: "media_url_unreachable", verifiedAt: null })] }) })
    expect(screen.getByText(text.failedTitle)).toBeTruthy()
    expect(screen.getByText(text.reasons.media_url_unreachable)).toBeTruthy()
    expect(screen.getByRole("button", { name: text.publishButton })).toBeTruthy()
  })

  it("validates the image URL, sends the approved caption, and refreshes after publishing", async () => {
    fetchMock.mockImplementation(() => ok({ deliveryId: "d-new", state: "published", counted: true }))
    mount()
    await openDialog()
    expect(screen.getByLabelText(text.captionLabel)).toHaveProperty("readOnly", true)
    expect(screen.getByText(text.captionCount.replace("{n}", String(BODY.length)))).toBeTruthy()
    expect(dialogButton(text.publishConfirm)).toHaveProperty("disabled", true)

    await fill("http://cdn.example.com/tea.jpg")
    expect(screen.getByText(text.reasons.invalid_image_url)).toBeTruthy()
    await fill(IMAGE)
    expect(screen.queryByText(text.reasons.invalid_image_url)).toBeNull()
    await confirm()
    expect(dialogButton(text.publishConfirm)).toHaveProperty("disabled", false)

    await act(async () => { fireEvent.click(dialogButton(text.publishConfirm)) })
    expect(posts("/publish-instagram")).toHaveLength(1)
    expect(body(0)).toEqual({ imageUrl: IMAGE, idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/), confirmVersionNo: 3 })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(onChanged).toHaveBeenCalled()
  })

  it("replays the same idempotency key after a network error and mints a new one after a terminal failure", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockImplementationOnce(() => ok({ deliveryId: "d-new", state: "failed", counted: false, reason: "provider_unavailable" }))
    mount()
    await openDialog()
    await fill(IMAGE)
    await confirm()
    await act(async () => { fireEvent.click(dialogButton(text.publishConfirm)) })
    expect(screen.getByText(text.reasons.network)).toBeTruthy()
    // Same dialog, same image: reuse the key so the route can replay the first request.
    await act(async () => { fireEvent.click(dialogButton(text.publishConfirm)) })
    expect(posts("/publish-instagram")).toHaveLength(2)
    expect(body(1).idempotencyKey).toBe(body(0).idempotencyKey)
    expect(screen.getByText(text.reasons.provider_unavailable)).toBeTruthy()
    // A terminal failure starts a new request: publish again uses a new key.
    fetchMock.mockImplementationOnce(() => ok({ deliveryId: "d-newer", state: "published", counted: true }))
    await act(async () => { fireEvent.click(dialogButton(text.publishConfirm)) })
    expect(body(2).idempotencyKey).not.toBe(body(0).idempotencyKey)
  })

  it("shows the dedicated rate-limit copy when a publish is refused with 429", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 })))
    mount()
    await openDialog()
    await fill(IMAGE)
    await confirm()
    await act(async () => { fireEvent.click(dialogButton(text.publishConfirm)) })
    expect(screen.getByText(text.reasons.rate_limited)).toBeTruthy()
  })

  it("asks for the Instagram connection instead of a publish button when none is active", () => {
    mount({ panel: panel({ connectionActive: false, canPublish: false }) })
    expect(screen.getByText(new RegExp(text.reasons.connection_missing))).toBeTruthy()
    const link = screen.getByRole("link", { name: text.connectInstagram })
    expect(link.getAttribute("href")).toBe("/en/owner/kam-man-house/settings/integrations")
    expect(screen.queryByRole("button", { name: text.publishButton })).toBeNull()
  })

  it("tells a member who may not publish that only the owner or in-scope manager can", () => {
    mount({ panel: panel({ mayAct: false, canPublish: false }) })
    expect(screen.getByText(text.noPermission)).toBeTruthy()
    expect(screen.queryByRole("button", { name: text.publishButton })).toBeNull()
  })
})
