// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house",
  useSearchParams: () => new URLSearchParams(),
}));

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
