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
type InstagramConnection = IntegrationsModel["instagram"]["connection"];

function model(status: GoogleStatus, instagram: Partial<InstagramConnection> = {}): IntegrationsModel {
  return {
    google: { status, expiresAt: null, updatedAt: "2026-09-01T00:00:00Z" },
    instagram: {
      handle: "kammanhouse",
      state: "measured",
      limitationCode: null,
      connection: { status: "not_connected", accountRef: null, updatedAt: null, ...instagram },
    },
    website: { state: "measured", checksPassed: 12, checksEvaluated: 15, observedAt: "2026-09-01T00:00:00Z" },
  };
}

function render(status: GoogleStatus, extra: { instagram?: Partial<InstagramConnection>; configured?: boolean; outcome?: string | null } = {}) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <IntegrationsView
      locale="en"
      workspaceSlug="kam-man-house"
      workspaceId="ws-1"
      timezone="Asia/Hong_Kong"
      model={model(status, extra.instagram)}
      instagramConfigured={extra.configured ?? true}
      instagramOutcome={extra.outcome ?? null}
    />,
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

describe("IntegrationsView when Google OAuth is not configured", () => {
  function renderUnconfigured(status: GoogleStatus) {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <IntegrationsView locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" model={model(status)} googleConfigured={false} instagramConfigured />,
    );
    return root;
  }

  it("does not link to the start route, which would answer 503 JSON", () => {
    const root = renderUnconfigured("not_connected");
    expect(root.querySelector('a[href^="/api/oauth/google/start"]')).toBeNull();
    const button = [...root.querySelectorAll("button")].find((b) => b.textContent?.includes("Connect Google"));
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(root.textContent).toContain("Connecting Google is not available yet");
  });

  it("keeps the link when configured (the default)", () => {
    expect(render("not_connected").querySelector('a[href^="/api/oauth/google/start"]')).not.toBeNull();
    expect(render("not_connected").textContent).not.toContain("not available yet");
  });
});

describe("IntegrationsView Instagram connection (P20.1)", () => {
  it("offers the connect link only when the OAuth client is configured", () => {
    // Configuring the Meta app is an owner/host action; until it is done the
    // start route answers 404/503 JSON, so the card must not link to it.
    expect(render("not_connected", { configured: true }).querySelector('a[href^="/api/oauth/instagram/start"]')).not.toBeNull();
    const unconfigured = render("not_connected", { configured: false });
    expect(unconfigured.querySelector('a[href^="/api/oauth/instagram/start"]')).toBeNull();
    expect(unconfigured.textContent).toContain("Connecting an Instagram account is not available yet");
  });

  it("shows the connected account and a disconnect control while the connection is active", () => {
    // The account id is stored alongside the username so the later publishing
    // and insight phases need no extra lookup; the owner sees the handle.
    const root = render("not_connected", {
      configured: true,
      instagram: { status: "active", accountRef: { id: "17841400000000000", username: "eldage" }, updatedAt: "2026-11-18T00:00:00Z" },
    });
    expect(root.textContent).toContain("Connected as @eldage");
    expect(root.textContent).toContain("Disconnect");
    // The dialog is explicit that connecting is for future explicit features
    // and nothing posts automatically.
    expect(root.textContent).toContain("Nothing is posted automatically");
  });

  it("never shows the connected state for a revoked credential", () => {
    // A revoked row still exists in the table; showing it as connected would
    // claim an authorisation the owner has withdrawn.
    const root = render("not_connected", {
      configured: true,
      instagram: { status: "revoked", accountRef: { id: "17841400000000000", username: "eldage" }, updatedAt: "2026-11-18T00:00:00Z" },
    });
    expect(root.textContent).not.toContain("Connected as @eldage");
    expect(root.textContent).not.toContain("Disconnect");
  });

  it("renders the callback outcome as content-free copy", () => {
    expect(render("not_connected", { configured: true, outcome: "declined" }).textContent).toContain("Instagram connection was cancelled");
    expect(render("not_connected", { configured: true, outcome: "exchange_failed" }).textContent).toContain("could not be completed");
    // Never echo the raw provider/error code into the page.
    expect(render("not_connected", { configured: true, outcome: "exchange_failed" }).textContent).not.toContain("exchange_failed");
  });
});
