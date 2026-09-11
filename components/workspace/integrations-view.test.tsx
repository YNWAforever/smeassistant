// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/settings/integrations",
  useSearchParams: () => new URLSearchParams(),
}));

import { IntegrationsView } from "@/components/workspace/integrations-view";
import type { IntegrationsModel } from "@/lib/workspace/queries-pages";

type GoogleStatus = IntegrationsModel["google"]["status"];

function model(status: GoogleStatus): IntegrationsModel {
  return {
    google: { status, expiresAt: null, updatedAt: "2026-09-01T00:00:00Z" },
    instagram: { handle: "kammanhouse", state: "measured", limitationCode: null },
    website: { state: "measured", checksPassed: 12, checksEvaluated: 15, observedAt: "2026-09-01T00:00:00Z" },
  };
}

function render(status: GoogleStatus) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <IntegrationsView locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" model={model(status)} />,
  );
  return root;
}

describe("IntegrationsView Google disconnect", () => {
  it("offers a disconnect control while the connection is active", () => {
    // The promise onboarding makes -- "you can disconnect at any time under
    // Settings > Integrations" -- is only true if the control is on this page.
    expect(render("active").textContent).toContain("Disconnect");
  });

  it("offers nothing to disconnect when no connection is active", () => {
    // There is no granted scope left to withdraw in any of these states, and
    // the route would answer disconnected:false anyway.
    for (const status of ["not_connected", "expired", "revoked", "error"] as const) {
      expect(render(status).textContent).not.toContain("Disconnect");
    }
  });

  it("keeps re-authorisation available alongside it", () => {
    // Disconnect must not replace the reconnect path: an owner who disconnects
    // by mistake needs the way back on the same card.
    expect(render("active").textContent).toContain("Re-authorise");
  });

  it("never claims that scanning depends on this connection", () => {
    // The scan engine does not read oauth_connections at all -- GBP evidence
    // comes from Google Places New and SerpApi. Both the lapsed-connection note
    // and the disconnect dialog used to say evidence reads stop, which would
    // have scared an owner out of a disconnect that costs them nothing.
    for (const status of ["active", "expired", "revoked", "error", "not_connected"] as const) {
      expect(render(status).textContent ?? "").not.toMatch(/evidence reads from Google stop|stops reading Google evidence/i);
    }
    expect(render("expired").textContent).toContain("Scans are unaffected");
  });
});
