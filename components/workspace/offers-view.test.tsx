// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const clientMocks = vi.hoisted(() => ({ createOffer: vi.fn(), updateOffer: vi.fn(), confirmOffer: vi.fn(), archiveOffer: vi.fn(), getUsage: vi.fn(), createPromotions: vi.fn(), runAction: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/workspace/client", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...clientMocks }));
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
  usePathname: () => "/en/owner/kam-man-house/offers",
  useSearchParams: () => new URLSearchParams(),
}));

import { OffersView, type OffersViewProps } from "@/components/workspace/offers-view";
import { copy } from "@/lib/copy";
import type { Offer } from "@/lib/workspace/offers";

const text = copy.en.workspace.offers;
const LOCATIONS = [{ id: "loc-1", slug: "yik-yam", name: "Yik Yam" }, { id: "loc-2", slug: "tin-hau", name: "Tin Hau" }];

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "offer-1", workspaceId: "ws-1", locationId: "loc-1", title: "Autumn set menu", details: "Two dishes and a drink", terms: "Dine in only",
    priceAmount: 1280, currency: "HKD", validFrom: "2026-10-01", validUntil: "2026-10-31", claims: ["Made fresh daily"], prohibitedTerms: [],
    assetId: null, status: "draft", revision: 3, confirmedAt: null, expired: false, createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

const ALL = { workspace: true, "loc-1": true, "loc-2": true };
const NONE = { workspace: false, "loc-1": false, "loc-2": false };

function mount(overrides: Partial<OffersViewProps> = {}) {
  return render(
    <OffersView locale="en" workspaceId="ws-1" market="hk" role="owner" canManage={ALL} canUse={ALL} offers={[]} locations={LOCATIONS} assets={[]} workspaceSlug="kam-man-house" {...overrides} />,
  );
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const queryButton = (name: string | RegExp) => screen.queryByRole("button", { name });

describe("OffersView", () => {
  beforeEach(() => { for (const mock of Object.values(clientMocks)) mock.mockReset(); toastMocks.error.mockReset(); toastMocks.success.mockReset(); routerMocks.refresh.mockReset(); });
  afterEach(cleanup);

  it("gives a viewer the list read-only: no create, edit, confirm, archive or promotion control", () => {
    mount({ role: "viewer", canManage: NONE, canUse: NONE, offers: [offer(), offer({ id: "offer-2", status: "confirmed", title: "Winter set" })] });
    expect(screen.getByText("Autumn set menu")).toBeInTheDocument();
    expect(screen.getByText(text.viewer.title)).toBeInTheDocument();
    for (const name of [text.actions.newOffer, text.actions.edit, text.actions.confirm, text.actions.archive, text.actions.createDrafts]) {
      expect(queryButton(name)).toBeNull();
    }
  });

  it("shows Confirm for a draft offer and Create promotion drafts for a confirmed one", () => {
    mount({ offers: [offer(), offer({ id: "offer-2", status: "confirmed", title: "Winter set", confirmedAt: "2026-10-01T00:00:00.000Z" })] });
    expect(screen.getAllByRole("button", { name: text.actions.confirm })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: text.actions.createDrafts })).toHaveLength(1);
  });

  it("marks an expired offer and offers no way to create drafts from it", () => {
    mount({ offers: [offer({ status: "confirmed", expired: true })] });
    expect(screen.getByText(text.status.expired)).toBeInTheDocument();
    expect(queryButton(text.actions.createDrafts)).toBeNull();
  });

  it("offers no promotion drafts for an archived offer or one outside the caller's use scope", () => {
    mount({ offers: [offer({ status: "archived" }), offer({ id: "offer-2", status: "confirmed", locationId: "loc-2" })], canUse: { ...ALL, "loc-2": false } });
    expect(queryButton(text.actions.createDrafts)).toBeNull();
    expect(queryButton(text.actions.edit)).not.toBeNull(); // the loc-2 offer is still editable by an owner
  });

  it("scopes manage controls per location: a workspace-wide offer is not editable by a location manager", () => {
    mount({ role: "manager", canManage: { workspace: false, "loc-1": true, "loc-2": false }, offers: [offer({ locationId: null, title: "House offer" }), offer({ id: "offer-2", locationId: "loc-1", title: "Yik Yam offer" })] });
    expect(screen.getAllByRole("button", { name: text.actions.edit })).toHaveLength(1);
  });

  it("fixes the form's currency to the market and gives it no selector", () => {
    mount();
    fireEvent.click(button(text.actions.newOffer));
    expect(screen.getByDisplayValue("HKD")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: text.fields.currency })).toBeNull();
    expect(screen.getByLabelText(text.fields.currency)).toBeDisabled();
    cleanup();
    mount({ market: "tw" });
    fireEvent.click(button(text.actions.newOffer));
    expect(screen.getByDisplayValue("TWD")).toBeInTheDocument();
  });

  it("submits the parsed body to create", async () => {
    clientMocks.createOffer.mockResolvedValue({ ok: true, data: { offer: offer() } });
    mount();
    fireEvent.click(button(text.actions.newOffer));
    fireEvent.change(screen.getByLabelText(text.fields.title), { target: { value: "  Spring set  " } });
    fireEvent.change(screen.getByLabelText(text.fields.details), { target: { value: "Two dishes" } });
    fireEvent.change(screen.getByLabelText(text.fields.price), { target: { value: "1,280.5" } });
    fireEvent.change(screen.getByLabelText(text.fields.validFrom), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText(text.fields.validUntil), { target: { value: "2026-10-31" } });
    fireEvent.change(screen.getByLabelText(text.fields.claims), { target: { value: "Fresh daily\n\n  Halal certified  \n" } });
    await act(async () => { fireEvent.click(button(text.actions.save)); });
    expect(clientMocks.createOffer).toHaveBeenCalledWith("ws-1", {
      location_id: "loc-1",
      title: "Spring set",
      details: "Two dishes",
      terms: "",
      price_amount: 1280.5,
      currency: "HKD",
      valid_from: "2026-10-01",
      valid_until: "2026-10-31",
      claims: ["Fresh daily", "Halal certified"],
      prohibited_terms: [],
      asset_id: null,
    });
    expect(routerMocks.refresh).toHaveBeenCalled();
    expect(toastMocks.success).toHaveBeenCalledWith(text.toasts.created);
  });

  it("sends no currency when there is no price, and never posts an invalid form", async () => {
    clientMocks.createOffer.mockResolvedValue({ ok: true, data: { offer: offer() } });
    mount();
    fireEvent.click(button(text.actions.newOffer));
    fireEvent.change(screen.getByLabelText(text.fields.title), { target: { value: "Free dessert" } });
    fireEvent.change(screen.getByLabelText(text.fields.details), { target: { value: "With any main" } });
    fireEvent.change(screen.getByLabelText(text.fields.validFrom), { target: { value: "2026-10-31" } });
    fireEvent.change(screen.getByLabelText(text.fields.validUntil), { target: { value: "2026-10-01" } });
    await act(async () => { fireEvent.click(button(text.actions.save)); });
    expect(clientMocks.createOffer).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(text.errors.dates);
    fireEvent.change(screen.getByLabelText(text.fields.validUntil), { target: { value: "2026-11-30" } });
    fireEvent.change(screen.getByLabelText(text.fields.price), { target: { value: "12.345" } });
    await act(async () => { fireEvent.click(button(text.actions.save)); });
    expect(screen.getByRole("alert")).toHaveTextContent(text.errors.price);
    fireEvent.change(screen.getByLabelText(text.fields.price), { target: { value: "" } });
    await act(async () => { fireEvent.click(button(text.actions.save)); });
    expect(clientMocks.createOffer).toHaveBeenCalledWith("ws-1", expect.objectContaining({ price_amount: null, currency: null }));
  });

  it.each(["12,80", "1,28", "1,2800", ",1280", "1280,", "1,,280", "1280.5,0"])(
    "refuses a comma that is not a thousands separator instead of changing the owner's price (%s)",
    async (value) => {
      mount();
      fireEvent.click(button(text.actions.newOffer));
      fireEvent.change(screen.getByLabelText(text.fields.title), { target: { value: "Set lunch" } });
      fireEvent.change(screen.getByLabelText(text.fields.details), { target: { value: "Weekdays" } });
      fireEvent.change(screen.getByLabelText(text.fields.validFrom), { target: { value: "2026-10-01" } });
      fireEvent.change(screen.getByLabelText(text.fields.validUntil), { target: { value: "2026-10-31" } });
      fireEvent.change(screen.getByLabelText(text.fields.price), { target: { value } });
      await act(async () => { fireEvent.click(button(text.actions.save)); });
      expect(clientMocks.createOffer).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(text.errors.price);
    },
  );

  it.each([["1,280", 1280], ["12,345,678.9", 12345678.9], ["1280", 1280]] as const)(
    "accepts a well-formed thousands separator (%s)",
    async (value, expected) => {
      clientMocks.createOffer.mockResolvedValue({ ok: true, data: { offer: offer() } });
      mount();
      fireEvent.click(button(text.actions.newOffer));
      fireEvent.change(screen.getByLabelText(text.fields.title), { target: { value: "Set lunch" } });
      fireEvent.change(screen.getByLabelText(text.fields.details), { target: { value: "Weekdays" } });
      fireEvent.change(screen.getByLabelText(text.fields.validFrom), { target: { value: "2026-10-01" } });
      fireEvent.change(screen.getByLabelText(text.fields.validUntil), { target: { value: "2026-10-31" } });
      fireEvent.change(screen.getByLabelText(text.fields.price), { target: { value } });
      await act(async () => { fireEvent.click(button(text.actions.save)); });
      expect(clientMocks.createOffer).toHaveBeenCalledWith("ws-1", expect.objectContaining({ price_amount: expected }));
    },
  );

  it("answers a 409 offer_revision_changed on save with the reload message and keeps the typed text", async () => {
    clientMocks.updateOffer.mockResolvedValue({ ok: false, status: 409, error: "offer_revision_changed" });
    mount({ offers: [offer()] });
    fireEvent.click(button(text.actions.edit));
    fireEvent.change(screen.getByLabelText(text.fields.title), { target: { value: "My long edited title" } });
    await act(async () => { fireEvent.click(button(text.actions.saveChanges)); });
    expect(clientMocks.updateOffer).toHaveBeenCalledWith("offer-1", 3, expect.objectContaining({ title: "My long edited title", location_id: "loc-1" }));
    expect(screen.getByRole("alert")).toHaveTextContent(text.errors.revisionChanged);
    expect(document.body.textContent ?? "").not.toContain("offer_revision_changed");
    expect(screen.getByLabelText(text.fields.title)).toHaveValue("My long edited title");
    // The form stays open with a way to reload; nothing was refreshed away.
    expect(routerMocks.refresh).not.toHaveBeenCalled();
    fireEvent.click(button(text.actions.reload));
    expect(routerMocks.refresh).toHaveBeenCalled();
    expect(screen.getByLabelText(text.fields.title)).toHaveValue("My long edited title");
  });

  it("saves against the refreshed revision after a conflict and a reload, keeping the typed fields", async () => {
    clientMocks.updateOffer.mockResolvedValueOnce({ ok: false, status: 409, error: "offer_revision_changed" });
    const props = { locale: "en" as const, workspaceId: "ws-1", market: "hk" as const, role: "owner" as const, canManage: ALL, canUse: ALL, locations: LOCATIONS, assets: [], workspaceSlug: "kam-man-house" };
    const view = render(<OffersView {...props} offers={[offer()]} />);
    fireEvent.click(button(text.actions.edit));
    fireEvent.change(screen.getByLabelText(text.fields.title), { target: { value: "My long edited title" } });
    await act(async () => { fireEvent.click(button(text.actions.saveChanges)); });
    expect(clientMocks.updateOffer).toHaveBeenLastCalledWith("offer-1", 3, expect.anything());
    fireEvent.click(button(text.actions.reload));
    // router.refresh() re-renders the page with the offer someone else changed: revision 4.
    view.rerender(<OffersView {...props} offers={[offer({ revision: 4, details: "Changed elsewhere" })]} />);
    expect(screen.getByLabelText(text.fields.title)).toHaveValue("My long edited title");
    clientMocks.updateOffer.mockResolvedValueOnce({ ok: true, data: { offer: offer({ revision: 5 }) } });
    await act(async () => { fireEvent.click(button(text.actions.saveChanges)); });
    expect(clientMocks.updateOffer).toHaveBeenLastCalledWith("offer-1", 4, expect.objectContaining({ title: "My long edited title" }));
    expect(toastMocks.success).toHaveBeenCalledWith(text.toasts.updated);
  });

  it("states what confirming means before it confirms, against the revision it was shown", async () => {
    clientMocks.confirmOffer.mockResolvedValue({ ok: true, data: { kind: "confirmed", revision: 3 } });
    mount({ offers: [offer()] });
    fireEvent.click(button(text.actions.confirm));
    expect(screen.getByText("These details are correct and may be used in drafts.")).toBeInTheDocument();
    expect(clientMocks.confirmOffer).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(button(text.confirm.action)); });
    expect(clientMocks.confirmOffer).toHaveBeenCalledWith("offer-1", 3);
    expect(toastMocks.success).toHaveBeenCalledWith(text.toasts.confirmed);
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("maps confirm refusals to owner copy", async () => {
    mount({ offers: [offer()] });
    for (const [status, error, expected] of [
      [422, "offer_incomplete", text.errors.incomplete],
      [422, "offer_currency_market", text.errors.currency],
      [409, "offer_revision_changed", text.errors.revisionChanged],
      [409, "offer_archived", text.errors.archived],
    ] as const) {
      clientMocks.confirmOffer.mockResolvedValue({ ok: false, status, error });
      if (!queryButton(text.confirm.action)) fireEvent.click(button(text.actions.confirm));
      await act(async () => { fireEvent.click(button(text.confirm.action)); });
      expect(screen.getByRole("alert")).toHaveTextContent(expected);
      expect(document.body.textContent ?? "").not.toContain(error);
    }
  });

  it("asks before archiving, then archives", async () => {
    clientMocks.archiveOffer.mockResolvedValue({ ok: true, data: { kind: "archived", cancelledActions: 1 } });
    mount({ offers: [offer({ status: "confirmed" })] });
    fireEvent.click(button(text.actions.archive));
    expect(screen.getByText(text.archiveStep.statement)).toBeInTheDocument();
    expect(clientMocks.archiveOffer).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(button(text.archiveStep.action)); });
    expect(clientMocks.archiveOffer).toHaveBeenCalledWith("offer-1");
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("opens the promotion panel for a confirmed offer with the real usage read", async () => {
    clientMocks.getUsage.mockResolvedValue({ ok: true, data: { period: "2026-10", approved_deliveries: 1, allowance: 3, tier: "lite" } });
    mount({ offers: [offer({ status: "confirmed" })] });
    await act(async () => { fireEvent.click(button(text.actions.createDrafts)); });
    expect(clientMocks.getUsage).toHaveBeenCalledWith("ws-1");
    expect(screen.getByText(/This month: 1 of 3 used\./)).toBeInTheDocument();
    expect(clientMocks.createPromotions).not.toHaveBeenCalled();
  });

  it("only lists rights-approved assets usable at the offer's location in the photo picker", () => {
    mount({ assets: [{ id: "a-1", filename: "shared.jpg", locationId: null }, { id: "a-2", filename: "yik-yam.jpg", locationId: "loc-1" }, { id: "a-3", filename: "tin-hau.jpg", locationId: "loc-2" }] });
    fireEvent.click(button(text.actions.newOffer));
    const picker = screen.getByLabelText(text.fields.asset);
    expect(Array.from(picker.querySelectorAll("option")).map((o) => o.textContent)).toEqual([text.noAsset, "shared.jpg", "yik-yam.jpg"]);
  });

  it("shows an empty state, and in three locales", () => {
    mount();
    expect(screen.getByText(text.list.empty)).toBeInTheDocument();
    cleanup();
    for (const locale of ["zh-HK", "zh-TW"] as const) {
      render(<OffersView locale={locale} workspaceId="ws-1" market="hk" role="owner" canManage={ALL} canUse={ALL} offers={[offer({ status: "confirmed" })]} locations={LOCATIONS} assets={[]} />);
      expect(screen.getByRole("button", { name: copy[locale].workspace.offers.actions.createDrafts })).toBeInTheDocument();
      cleanup();
    }
  });
});
