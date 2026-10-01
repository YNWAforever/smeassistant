// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const offerClient = vi.hoisted(() => ({ prepareDrafts: vi.fn(), confirmOffer: vi.fn(), archiveOffer: vi.fn(), createOffer: vi.fn(), updateOffer: vi.fn() }));
const workspaceClient = vi.hoisted(() => ({ runAction: vi.fn() }));
vi.mock("@/lib/offers/client", () => offerClient);
vi.mock("@/lib/workspace/client", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), runAction: workspaceClient.runAction }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/en/owner/w/offers/x", useSearchParams: () => new URLSearchParams() }));

import { OfferDetail, type OfferDetailProps } from "@/components/workspace/offer-detail";
import { offerRow } from "@/lib/offers/fixtures.test-helpers";
import { toOfferView } from "@/lib/offers/view";
import { getMessages } from "@/lib/i18n";
import type { OfferChannelState } from "@/lib/offers/pages";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const en = getMessages("en").offers;
const channels = (market: "hk" | "tw", existing: Partial<Record<string, string>> = {}): OfferChannelState[] => [
  { templateKey: "offer-gbp-post", channel: "google_post", action: existing["offer-gbp-post"] ? { id: existing["offer-gbp-post"]!, template_key: "offer-gbp-post", action_state: "in_progress", run_state: "succeeded", latest_version_id: "v1", approval_state: "draft", delivery_state: "not_requested" } : null },
  { templateKey: "offer-social-post", channel: "instagram_post", action: null },
  { templateKey: "offer-chat-message", channel: market === "tw" ? "line_message" : "whatsapp_message", action: null },
];

function mount(props: Partial<OfferDetailProps> = {}) {
  render(
    <OfferDetail locale="en" workspaceId="ws-1" workspaceSlug="w" market="hk" offer={toOfferView(offerRow({ starts_on: "2026-09-01" }), { today: "2026-10-10", locale: "en" })} canManage channels={channels("hk")}
      usage={{ approvedDeliveries: 2, allowance: 3 }} locations={[]} manageableLocationIds={null} photos={[]} photoBriefHref="/en/owner/w/create" {...props} />,
  );
}

describe("OfferDetail", () => {
  it("shows the delivery notice before the Prepare button, with the period usage", () => {
    mount();
    const notice = screen.getByTestId("delivery-notice");
    expect(notice.textContent).toContain("This prepares 3 separate drafts");
    expect(notice.textContent).toContain("2 of 3 used");
    const button = screen.getByRole("button", { name: en.prepare.button });
    expect(notice.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("uses the unlimited wording on a paid plan", () => {
    mount({ usage: { approvedDeliveries: 5, allowance: null } });
    expect(screen.getByTestId("delivery-notice").textContent).toContain("no limit on your plan");
  });
  it("labels the chat channel by market", () => {
    mount();
    expect(screen.getByText(en.channels.whatsapp_message)).toBeTruthy();
    cleanup();
    mount({ market: "tw", channels: channels("tw") });
    expect(screen.getByText(en.channels.line_message)).toBeTruthy();
    expect(screen.queryByText(en.channels.whatsapp_message)).toBeNull();
  });
  it("prepares, runs each draft once, and retries only the failed channel", async () => {
    offerClient.prepareDrafts.mockResolvedValue({ ok: true, data: { actions: [{ templateKey: "offer-gbp-post", actionId: "a1", created: true }, { templateKey: "offer-chat-message", actionId: "a3", created: true }] } });
    workspaceClient.runAction.mockImplementation(async (id: string) => (id === "a3" ? { ok: false, status: 503, error: "unavailable" } : { ok: true, data: { runId: "r", state: "succeeded", versionId: "v" } }));
    mount();
    fireEvent.click(screen.getByRole("checkbox", { name: en.channels.instagram_post }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: en.prepare.button })); });
    expect(offerClient.prepareDrafts).toHaveBeenCalledWith("ws-1", offerRow().id, ["offer-gbp-post", "offer-chat-message"], "en");
    expect(workspaceClient.runAction.mock.calls.map((c) => c[0])).toEqual(["a1", "a3"]);
    expect(screen.getByText(en.run.ready)).toBeTruthy();
    expect(screen.getByText(en.run.failed)).toBeTruthy();
    workspaceClient.runAction.mockClear();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: en.run.tryAgain })); });
    expect(workspaceClient.runAction.mock.calls.map((c) => c[0])).toEqual(["a3"]);
  });
  it("links an existing draft instead of preparing it again", () => {
    mount({ channels: channels("hk", { "offer-gbp-post": "a1" }) });
    expect(screen.getAllByRole("link", { name: en.prepare.exists })[0].getAttribute("href")).toBe("/en/owner/w/actions/a1");
    expect(screen.getByRole("checkbox", { name: en.channels.google_post }).getAttribute("aria-checked")).toBe("false");
  });
  it("says the photo brief generates nothing", () => {
    mount();
    expect(screen.getByRole("link", { name: en.prepare.photoBrief })).toBeTruthy();
    expect(en.prepare.photoBrief).toContain("nothing is generated");
  });
  it("refuses to prepare from a draft offer", () => {
    mount({ offer: toOfferView(offerRow({ status: "draft", confirmed_at: null }), { today: "2026-10-10", locale: "en" }) });
    expect(screen.getByText(en.prepare.notReady)).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.prepare.button })).toBeNull();
  });
});
