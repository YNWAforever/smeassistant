// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MARKETS } from "@sme-scanner/region";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/settings/billing",
  useSearchParams: () => new URLSearchParams(),
}));

import { BillingView, type BillingViewProps } from "@/components/workspace/billing-view";
import type { BillingModel } from "@/lib/workspace/billing";
import { t } from "@/lib/i18n";

/**
 * P3.3 task 5: the owner billing page must never offer Stripe (enabled or
 * disabled) while billing is closed, for any role, and must say so with the
 * shared `commercial.notOpen` label instead of the old "Subscribe to unlock
 * the Growth Workspace" copy.
 */
function baseModel(overrides: Partial<BillingModel> = {}): BillingModel {
  return {
    tier: "lite",
    usage: { period: "2026-09", approvedDeliveries: 1, allowance: 3 },
    tierEvents: [
      { id: "evt-1", tier: "lite", source: "staff_grant", stripeEventId: null, createdAt: "2026-09-01T00:00:00Z" },
    ],
    stripeCustomer: false,
    marketPrice: MARKETS.hk.pricing,
    ...overrides,
  };
}

function render(props: Partial<BillingViewProps> & { billingOpen: boolean; contactHref: string | null }) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <BillingView
      locale="en"
      workspaceId="ws-1"
      role="owner"
      timezone="Asia/Hong_Kong"
      model={baseModel()}
      {...props}
    />,
  );
  return root;
}

describe("BillingView while billing is closed", () => {
  it("owner sees no Stripe button text and the not-open label, but still sees usage and tier history", () => {
    const root = render({ role: "owner", billingOpen: false, contactHref: null });
    expect(root.textContent).not.toContain("Subscribe via Stripe");
    expect(root.textContent).not.toContain("Manage billing");
    expect(root.textContent).not.toContain("透過 Stripe 訂閱");
    expect(root.textContent).not.toContain("管理帳單");
    expect(root.textContent).toContain(t("en", "commercial.notOpen"));
    expect(root.textContent).toContain("1 / 3");
    expect(root.textContent).not.toContain("Subscribe to unlock the Growth Workspace");
  });

  it("manager sees no Subscribe/Manage buttons, enabled or disabled, only the label", () => {
    const root = render({ role: "manager", billingOpen: false, contactHref: null });
    const buttons = Array.from(root.querySelectorAll("button"));
    const buttonTexts = buttons.map((b) => b.textContent ?? "");
    expect(buttonTexts.some((text) => text.includes("Subscribe via Stripe"))).toBe(false);
    expect(buttonTexts.some((text) => text.includes("Manage billing"))).toBe(false);
    expect(root.textContent).toContain(t("en", "commercial.notOpen"));
  });

  it("wraps the label in a link when a contact channel is configured", () => {
    const root = render({ role: "owner", billingOpen: false, contactHref: "mailto:hello@example.com" });
    const notes = Array.from(root.querySelectorAll(".limitation-note"));
    const labelNote = notes.find((n) => n.textContent?.includes(t("en", "commercial.notOpen")));
    expect(labelNote?.querySelector("a")?.getAttribute("href")).toBe("mailto:hello@example.com");
  });

  it("renders the label as plain text with no <a> when no contact channel is configured", () => {
    const root = render({ role: "owner", billingOpen: false, contactHref: null });
    const notes = Array.from(root.querySelectorAll(".limitation-note"));
    const labelNote = notes.find((n) => n.textContent?.includes(t("en", "commercial.notOpen")));
    expect(labelNote?.querySelector("a")).toBeNull();
  });
});

describe("BillingView while billing is open", () => {
  it("owner on lite sees Subscribe via Stripe, and no not-open label", () => {
    const root = render({ role: "owner", billingOpen: true, contactHref: null });
    expect(root.textContent).toContain("Subscribe via Stripe");
    expect(root.textContent).not.toContain(t("en", "commercial.notOpen"));
  });

  it("owner on paid with a Stripe customer sees Manage billing", () => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <BillingView
        locale="en"
        workspaceId="ws-1"
        role="owner"
        timezone="Asia/Hong_Kong"
        model={baseModel({ tier: "paid", stripeCustomer: true })}
        billingOpen
        contactHref={null}
      />,
    );
    expect(root.textContent).toContain("Manage billing");
  });
});
