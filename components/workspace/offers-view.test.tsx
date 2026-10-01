// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/en/owner/w/offers", useSearchParams: () => new URLSearchParams() }));

import { OffersView, type OffersViewProps } from "@/components/workspace/offers-view";
import { offerRow } from "@/lib/offers/fixtures.test-helpers";
import { toOfferView } from "@/lib/offers/view";
import { getMessages } from "@/lib/i18n";

const en = getMessages("en").offers;
const view = (over: Parameters<typeof offerRow>[0], today = "2026-10-10") => toOfferView(offerRow({ workspace_id: "ws-1", ...over }), { today, locale: "en", draftCount: 1 });

function render(props: Partial<OffersViewProps> = {}) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <OffersView locale="en" workspaceId="ws-1" workspaceSlug="w" market="hk" locations={[]} canCreate manageableLocationIds={null} photos={[]} newForm={null}
      offers={[view({ id: "a" }), view({ id: "b", starts_on: "2026-11-01", ends_on: null, open_ended: true }), view({ id: "c", status: "draft" }), view({ id: "d", status: "archived", archived_at: "x" })]}
      {...props} />,
  );
  return root;
}

describe("OffersView", () => {
  it("groups offers by phase, each with the Beta badge", () => {
    const root = render();
    const groups = Array.from(root.querySelectorAll(".offer-group .eyebrow")).map((n) => n.textContent);
    expect(groups).toEqual([en.groups.running, en.groups.upcoming, en.groups.draft, en.groups.ended]);
    const rows = root.querySelectorAll(".offer-row");
    expect(rows).toHaveLength(4);
    for (const row of Array.from(rows)) expect(row.textContent).toContain("Beta");
    expect(root.textContent).toContain("HK$88");
  });
  it("offers New offer only to members who can create", () => {
    expect(render().textContent).toContain(en.new);
    expect(render({ canCreate: false }).textContent).not.toContain(en.new);
  });
  it("shows the empty state", () => {
    expect(render({ offers: [] }).textContent).toContain(en.empty);
  });
});
