// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house",
  useSearchParams: () => new URLSearchParams(),
}));

import { FixPackCard } from "@/components/workspace/fix-pack-card";
import { HomeBriefView } from "@/components/workspace/home-brief";
import type { HomeBrief } from "@/lib/workspace/queries-pages";

/**
 * P3.2 task 9 FIX 2: the "Before and after" proof card on Home is the other
 * surface that shows `attribution_basis` (action-detail-client.test.tsx
 * covers the Actions surface). No test reached HomeBriefView before this
 * file; a minimal fixture (snapshot/priority null -- neither is exercised
 * here) is enough because the proof card renders independently of them.
 */
function baseBrief(proof: HomeBrief["proof"]): HomeBrief {
  return {
    locationSlug: "yik-yam",
    location: null,
    snapshot: null,
    changed: { factType: "Unknown", delta: null, base: null, head: null, reason: null, comparable: false },
    priority: null,
    openActions: [],
    proof,
    month: { resolved: 0, regressed: 0, awaitingApproval: 0, completed: 0, measured: 0 },
    rescanCadenceDay: null,
    drafts: 0,
    agentStrip: { scout: false, priority: false, drafts: 0, awaiting: 0 },
    ledger: { resolved: [], regressed: [], decayed: [] },
    integrations: {
      google: { status: "not_connected", expiresAt: null, updatedAt: null },
      instagram: { handle: null, state: "unknown", limitationCode: null },
      website: { state: "unknown", checksPassed: null, checksEvaluated: null, observedAt: null },
    },
    evidence: [],
  };
}

function render(proof: HomeBrief["proof"], problems?: ReactNode) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <HomeBriefView
      locale="en"
      workspaceSlug="kam-man-house"
      workspaceId="ws-1"
      workspaceName="Kam Man House"
      tier="paid"
      timezone="Asia/Hong_Kong"
      locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
      brief={baseBrief(proof)}
      consentPolicyVersion="2026-07-28"
      problems={problems}
    />,
  );
  return root;
}

describe("HomeBriefView proof card", () => {
  const baseProof = {
    metricKey: "gbp.response_rate_pct",
    before: 18,
    after: 42,
    delta: 24,
    windowDays: 30,
    observedAt: "2026-09-10T00:00:00Z",
  };

  it("renders 'basis not recorded' for an Attributed proof with a null attribution_basis, and no other basis string", () => {
    const text = render({ ...baseProof, factType: "Attributed", attributionBasis: null }).textContent ?? "";
    expect(text).toContain("basis not recorded");
    expect(text).not.toContain("verified on site");
    expect(text).not.toContain("you reported applying this");
    expect(text).not.toMatch(/·\s*exported\b/);
  });

  it("renders the recorded basis for an Attributed proof with a non-null attribution_basis", () => {
    const text = render({ ...baseProof, factType: "Attributed", attributionBasis: "owner_asserted" }).textContent ?? "";
    expect(text).toContain("you reported applying this");
    expect(text).not.toContain("basis not recorded");
  });

  it("never shows a basis at all for a non-Attributed proof (e.g. Observed)", () => {
    const text = render({ ...baseProof, factType: "Observed", attributionBasis: null }).textContent ?? "";
    expect(text).not.toContain("basis not recorded");
    expect(text).not.toContain("verified on site");
    expect(text).not.toContain("you reported applying this");
  });

  it("shows the empty state when there is nothing measured yet", () => {
    const text = render(null).textContent ?? "";
    expect(text).toContain("Proof appears after an action is completed and a comparable scan lands");
  });
});

describe("HomeBriefView problems slot", () => {
  it("renders the problems slot after the page's <h1>, never before it", () => {
    const html = render(null, <div data-testid="problems-marker"><h2>Needs attention</h2></div>).innerHTML;
    const h1Index = html.indexOf("<h1>");
    const markerIndex = html.indexOf('data-testid="problems-marker"');
    expect(h1Index).toBeGreaterThanOrEqual(0);
    expect(markerIndex).toBeGreaterThan(h1Index);
  });

  it("renders nothing extra when problems is omitted", () => {
    const root = render(null);
    expect(root.querySelector('[data-testid="problems-marker"]')).toBeNull();
  });
});

describe("HomeBriefView work packs (P4.2)", () => {
  const props = {
    locale: "en" as const,
    workspaceSlug: "kam-man-house",
    workspaceId: "ws-1",
    workspaceName: "Kam Man House",
    tier: "paid" as const,
    timezone: "Asia/Hong_Kong",
    locations: [{ slug: "yik-yam", name: "Yik Yam" }],
    brief: baseBrief(null),
    consentPolicyVersion: "2026-07-28",
    fixPack: { workspaceId: "ws-1", role: "owner" as const },
  };

  function html(extra: Partial<React.ComponentProps<typeof HomeBriefView>> = {}): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(<HomeBriefView {...props} {...extra} />);
    return root;
  }

  it("without workPacks renders exactly today's FixPackCard and no pack card", () => {
    const root = html();
    const expected = document.createElement("div");
    expected.innerHTML = renderToStaticMarkup(<FixPackCard locale="en" workspaceId="ws-1" viewerRole="owner" actionsHref="/en/owner/kam-man-house/actions?view=drafts" />);
    expect(root.querySelector(".fix-pack-card")?.outerHTML).toBe(expected.firstElementChild?.outerHTML);
    expect(root.querySelector(".pack-card")).toBeNull();
    expect(root.textContent).not.toContain("Visibility starter pack");
  });

  it("with workPacks renders the pack card and the earlier-drafts mode instead of the full Fix Pack card", () => {
    const root = html({
      workPacks: {
        enabled: true,
        card: { workspaceId: "ws-1", workspaceSlug: "kam-man-house", role: "owner", location: { id: "loc-1", isAll: false }, inScope: true, usage: { approvedDeliveries: 1, allowance: 3 }, initialPack: null },
        earlierDrafts: { workspaceId: "ws-1", role: "owner" },
      },
    });
    expect(root.querySelector(".pack-card")).not.toBeNull();
    expect(root.textContent).toContain("Start your visibility starter pack");
    expect(root.textContent).toContain("This month: 1 of 3 used.");
    // The earlier-drafts card renders nothing until a pending draft is known, and the full card's empty state is gone.
    expect(root.querySelector(".fix-pack-card")).toBeNull();
    expect(root.textContent).not.toContain("Fix Pack drafts are not available");
  });
});
