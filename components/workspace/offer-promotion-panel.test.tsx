// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const clientMocks = vi.hoisted(() => ({ createPromotions: vi.fn(), runAction: vi.fn() }));
vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createPromotions: clientMocks.createPromotions,
  runAction: clientMocks.runAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/offers",
  useSearchParams: () => new URLSearchParams(),
}));

import { OfferPromotionPanel } from "@/components/workspace/offer-promotion-panel";
import { copy } from "@/lib/copy";

const text = copy.en.workspace.offers;
const CREATED = { ok: true, data: { actions: [{ channel: "instagram", actionId: "act-ig", created: true }, { channel: "google", actionId: "act-g", created: true }] } };
const READY = { ok: true, data: { runId: "run-1", state: "succeeded", versionId: "ver-1", versionNo: 1 } };
const FAILED = { ok: true, data: { runId: "run-2", state: "failed", error: "model_timeout" } };

function mount(overrides: Partial<React.ComponentProps<typeof OfferPromotionPanel>> = {}) {
  return render(
    <OfferPromotionPanel locale="en" offerId="offer-1" offerTitle="Autumn set menu" usage={{ approvedDeliveries: 1, allowance: 3 }} canCreate actionsHref="/en/owner/kam-man-house/actions" {...overrides} />,
  );
}

describe("OfferPromotionPanel", () => {
  beforeEach(() => { clientMocks.createPromotions.mockReset(); clientMocks.runAction.mockReset(); });
  afterEach(cleanup);

  it("states the delivery unit and this month's usage before any request is made", () => {
    mount();
    expect(screen.getByText(
      "Creates 2 drafts (Instagram, Google). Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery. This month: 1 of 3 used.",
    )).toBeInTheDocument();
    expect(clientMocks.createPromotions).not.toHaveBeenCalled();
    expect(clientMocks.runAction).not.toHaveBeenCalled();
  });

  it("leaves the usage sentence out when the allowance is unlimited", () => {
    mount({ usage: { approvedDeliveries: 7, allowance: null } });
    const disclosure = screen.getByText(/^Creates 2 drafts/);
    expect(disclosure.textContent).toBe("Creates 2 drafts (Instagram, Google). Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery.");
    expect(disclosure.textContent).not.toContain("This month");
  });

  it("states the unit in each locale", () => {
    for (const locale of ["zh-HK", "zh-TW"] as const) {
      const { unmount } = mount({ locale });
      const expected = copy[locale].workspace.offers.promotion.disclosure.replace("{n}", "2").replace("{channels}", "Instagram、Google") + copy[locale].workspace.offers.promotion.usage.replace("{used}", "1").replace("{allowance}", "3");
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("creates the actions first, then runs each one in turn", async () => {
    clientMocks.createPromotions.mockResolvedValue(CREATED);
    let finishFirst!: (value: unknown) => void;
    clientMocks.runAction.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; })).mockResolvedValue(READY);
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.promotion.create })); });
    expect(clientMocks.createPromotions).toHaveBeenCalledWith("offer-1");
    // The second run does not start until the first has answered.
    expect(clientMocks.runAction).toHaveBeenCalledTimes(1);
    expect(clientMocks.runAction).toHaveBeenNthCalledWith(1, "act-ig");
    expect(screen.getByText(text.promotion.states.generating)).toBeInTheDocument();
    await act(async () => { finishFirst(READY); });
    expect(clientMocks.runAction).toHaveBeenCalledTimes(2);
    expect(clientMocks.runAction).toHaveBeenNthCalledWith(2, "act-g");
    expect(screen.getAllByText(text.promotion.states.ready)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: text.promotion.open }).map((a) => a.getAttribute("href"))).toEqual([
      "/en/owner/kam-man-house/actions/act-ig",
      "/en/owner/kam-man-house/actions/act-g",
    ]);
  });

  it("shows a failed Instagram draft with Retry and a ready Google draft, and retry runs only Instagram", async () => {
    clientMocks.createPromotions.mockResolvedValue(CREATED);
    clientMocks.runAction.mockImplementation(async (id: string) => (id === "act-ig" ? FAILED : READY));
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.promotion.create })); });
    expect(clientMocks.runAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText(text.promotion.states.failed)).toBeInTheDocument();
    expect(screen.getByText(text.promotion.states.ready)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: new RegExp(text.promotion.retry) })).toHaveLength(1);
    // The raw failure reason is never shown.
    expect(document.body.textContent ?? "").not.toContain("model_timeout");

    clientMocks.runAction.mockClear();
    clientMocks.runAction.mockResolvedValue(READY);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: new RegExp(text.promotion.retry) })); });
    expect(clientMocks.runAction).toHaveBeenCalledTimes(1);
    expect(clientMocks.runAction).toHaveBeenCalledWith("act-ig");
    expect(screen.getAllByText(text.promotion.states.ready)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: new RegExp(text.promotion.retry) })).toBeNull();
  });

  it("treats a refused run (spend budget, kill switch) as that draft failing, in plain words", async () => {
    clientMocks.createPromotions.mockResolvedValue(CREATED);
    clientMocks.runAction.mockImplementation(async (id: string) => (id === "act-ig" ? { ok: false, status: 429, error: "ai_budget_reached" } : READY));
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.promotion.create })); });
    expect(screen.getByText(text.promotion.states.failed)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain("ai_budget_reached");
    expect(screen.getByText(text.promotion.states.ready)).toBeInTheDocument();
  });

  it("shows the facts message for a needs_input result and never offers offer_id", async () => {
    clientMocks.createPromotions.mockResolvedValue(CREATED);
    clientMocks.runAction.mockImplementation(async (id: string) => (id === "act-ig" ? { ok: true, data: { runId: "r", state: "succeeded", factsNeeded: ["offer_id", "brand_voice"] } } : READY));
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.promotion.create })); });
    expect(screen.getByText(text.promotion.states.needs_input)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`More details are needed before this draft can be written: ${copy.en.workspace.inputs.brand_voice}\\.`))).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain(copy.en.workspace.inputs.offer_id);
    expect(document.body.textContent ?? "").not.toContain("offer_id");
    // Needs-input is not a failure: no retry for it.
    expect(screen.queryByRole("button", { name: new RegExp(text.promotion.retry) })).toBeNull();
  });

  it("maps a refused creation to owner copy, not the code", async () => {
    clientMocks.createPromotions.mockResolvedValue({ ok: false, status: 409, error: "offer_expired" });
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: text.promotion.create })); });
    expect(screen.getByRole("alert")).toHaveTextContent(text.stale.offer_expired);
    expect(clientMocks.runAction).not.toHaveBeenCalled();
    expect(document.body.textContent ?? "").not.toContain("offer_expired");
    // Nothing was created, so the owner can try again once the offer is fixed.
    expect(screen.getByRole("button", { name: text.promotion.create })).toBeEnabled();
  });

  it("cannot create when the caller may not use the offer", () => {
    mount({ canCreate: false });
    expect(screen.getByRole("button", { name: text.promotion.create })).toBeDisabled();
    expect(screen.getByText(text.promotion.noPermission)).toBeInTheDocument();
  });
});
