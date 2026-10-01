// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const clientMocks = vi.hoisted(() => ({ createOffer: vi.fn(), updateOffer: vi.fn() }));
vi.mock("@/lib/offers/client", () => clientMocks);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/en/owner/w/offers", useSearchParams: () => new URLSearchParams() }));

import { OfferForm } from "@/components/workspace/offer-form";
import { EMPTY_OFFER_FORM, offerFormFrom } from "@/lib/offers/form";
import { offerRow } from "@/lib/offers/fixtures.test-helpers";
import { getMessages } from "@/lib/i18n";

// Radix's checkbox measures its hidden form input; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const mount = (market: "hk" | "tw", locale: "en" | "zh-HK" | "zh-TW" = "en") =>
  render(<OfferForm locale={locale} workspaceId="ws-1" workspaceSlug="w" market={market} locations={[{ id: "L1", name: "Yik Yam" }]} manageableLocationIds={null} photos={[]} initial={EMPTY_OFFER_FORM} />);

describe("OfferForm", () => {
  it("prefixes the price with the market currency and has no currency picker", () => {
    mount("hk");
    expect(screen.getByTestId("offer-price-prefix").textContent).toBe("HK$");
    cleanup();
    mount("tw");
    expect(screen.getByTestId("offer-price-prefix").textContent).toBe("NT$");
    expect(screen.queryByLabelText(/currency/i)).toBeNull();
  });
  it("disables the end date for an open-ended offer", () => {
    mount("hk");
    const ends = document.getElementById("offer-ends") as HTMLInputElement;
    expect(ends.disabled).toBe(false);
    fireEvent.click(document.getElementById("offer-open-ended")!);
    expect((document.getElementById("offer-ends") as HTMLInputElement).disabled).toBe(true);
  });
  it.each(["en", "zh-HK", "zh-TW"] as const)("says nothing is read from photos (%s)", (locale) => {
    mount("hk", locale);
    expect(document.body.textContent).toContain(getMessages(locale).offers.form.note);
  });
  it("starting a new offer from an old one keeps every fact but the dates", () => {
    const from = offerFormFrom(offerRow({ approved_claims: ["Home-made"], prohibited_wording: ["cheapest"], asset_ids: ["A1"], location_id: "L1" }));
    expect(from).toEqual({ title: "Weekday lunch set", details: "Soup, main and drink", terms: "Monday to Friday, 12:00–15:00", price: "88", startsOn: "", endsOn: "", openEnded: false, claims: "Home-made", wording: "cheapest", assetIds: ["A1"], locationId: "L1" });
  });
  it("only offers a scoped manager their own locations, never all locations", () => {
    render(<OfferForm locale="en" workspaceId="ws-1" workspaceSlug="w" market="hk" locations={[{ id: "L1", name: "Yik Yam" }, { id: "L2", name: "Tin Hau" }]} manageableLocationIds={["L1"]} photos={[]} initial={{ ...EMPTY_OFFER_FORM, locationId: "L1" }} />);
    const options = Array.from((document.getElementById("offer-location") as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options).toEqual(["Yik Yam"]);
  });
});
