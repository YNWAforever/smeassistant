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
import { copy } from "@/lib/copy";
import type { HomeBrief } from "@/lib/workspace/queries-pages";
import { buildActionOverview } from "@/lib/workspace/overview";
import { actionRow, snapshot } from "@/lib/assistant/__fixtures__";

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

/**
 * FA-04: home leads with the one thing to do today; the methodology stays one
 * tap away inside a closed 「為何可信」 disclosure.
 */
describe("HomeBriefView today-first layout (FA-04)", () => {
  function priority(missing: string[] = []) {
    return buildActionOverview(
      { ...actionRow, required_inputs: missing, provided_inputs: {} },
      { location: { id: actionRow.location_id, slug: "yik-yam", name: { en: "Yik Yam", "zh-HK": "奕蔭街", "zh-TW": "奕蔭街" } }, latestRun: null, latestVersion: null },
    );
  }
  function view(opts: { locale?: "en" | "zh-HK" | "zh-TW"; tier?: "lite" | "paid"; role?: "owner" | "manager" | "viewer"; priority?: ReturnType<typeof priority> | null; withSnapshot?: boolean; openActionCount?: number; openActions?: HomeBrief["openActions"] } = {}) {
    const brief = baseBrief(null);
    brief.priority = opts.priority === undefined ? priority() : opts.priority;
    Object.assign(brief, { openActionCount: opts.openActionCount });
    if (opts.openActions) brief.openActions = opts.openActions;
    if (opts.withSnapshot) brief.snapshot = snapshot;
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <HomeBriefView
        locale={opts.locale ?? "en"}
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        workspaceName="Kam Man House"
        tier={opts.tier ?? "paid"}
        timezone="Asia/Hong_Kong"
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        brief={brief}
        consentPolicyVersion="2026-07-28"
        role={opts.role}
      />,
    );
    return root;
  }

  it("renders the 今日要做 card before every methodology section", () => {
    const html = view().innerHTML;
    const today = html.indexOf("brief-priority-card");
    expect(today).toBeGreaterThan(-1);
    for (const later of ["workspace-agent-strip", "integration-health-card", "change-ledger-card", "operational-footnote"]) {
      expect(html.indexOf(later)).toBeGreaterThan(today);
    }
  });

  it("labels the card 今日要做 in every locale", () => {
    expect(view({ locale: "en" }).querySelector(".brief-priority-card")?.textContent).toContain("Do this today");
    expect(view({ locale: "zh-HK" }).querySelector(".brief-priority-card")?.textContent).toContain("今日要做");
    expect(view({ locale: "zh-TW" }).querySelector(".brief-priority-card")?.textContent).toContain("今日要做");
  });

  it("names one verb on the card's button: Start, or Add the missing facts when inputs are missing", () => {
    expect(view({ priority: priority() }).querySelector(".brief-priority-actions a")?.textContent).toContain("Start");
    expect(view({ priority: priority(["opening_hours"]) }).querySelector(".brief-priority-actions a")?.textContent).toContain("Add the missing facts");
    expect(view({ locale: "zh-HK", priority: priority() }).querySelector(".brief-priority-actions a")?.textContent).toContain("開始處理");
  });

  it("folds the methodology into one closed 「為何可信」 disclosure", () => {
    const disclosure = view().querySelector("details.trust-disclosure");
    expect(disclosure).not.toBeNull();
    expect(disclosure!.hasAttribute("open")).toBe(false);
    expect(disclosure!.querySelector("summary")?.textContent).toContain("Why you can trust this");
    for (const inside of [".workspace-agent-strip", ".integration-health-card", ".change-ledger-card", ".operational-footnote"]) {
      expect(disclosure!.querySelector(inside)).not.toBeNull();
    }
    expect(view({ locale: "zh-HK" }).querySelector("details.trust-disclosure summary")?.textContent).toContain("為何可信");
  });

  it("keeps the decision queue outside the disclosure", () => {
    const root = view();
    expect(root.querySelector(".pending-approval-card")).not.toBeNull();
    expect(root.querySelector("details.trust-disclosure .pending-approval-card")).toBeNull();
  });

  it("shows the full open-action count outside the disclosure alongside the bounded preview", () => {
    const actions = [0, 1, 2].map((index) => ({ ...priority(), id: `action-${index}` }));
    for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
      const root = view({ locale, openActionCount: 37, openActions: actions });
      const queue = root.querySelector(".pending-approval-card");
      expect(queue?.textContent).toContain(locale === "en" ? "37 open actions" : "共有 37 項待辦");
      expect(queue?.querySelectorAll(".compact-action-list a")).toHaveLength(3);
      expect(root.querySelector("details.trust-disclosure .pending-approval-card")).toBeNull();
    }
  });

  it("gives an empty week a concrete next step, naming Rescan only to someone who can use it", () => {
    const paidOwner = view({ priority: null, withSnapshot: true, tier: "paid", role: "owner" }).querySelector(".brief-priority-card")?.textContent ?? "";
    expect(paidOwner).toContain("Nothing new this week; check back after your next scan.");
    expect(paidOwner).toContain("To check now, use Rescan.");
    for (const textOf of [
      view({ priority: null, withSnapshot: true, tier: "lite", role: "owner" }),
      view({ priority: null, withSnapshot: true, tier: "paid", role: "viewer" }),
    ]) {
      const text = textOf.querySelector(".brief-priority-card")?.textContent ?? "";
      expect(text).toContain("Nothing new this week; check back after your next scan.");
      expect(text).not.toContain("Rescan");
    }
    expect(view({ locale: "zh-HK", priority: null, withSnapshot: true, tier: "lite" }).querySelector(".brief-priority-card")?.textContent).toContain("本週沒有新行動，下次掃描後再看。");
  });
});

// F-19 (hosted acceptance 2026-10-09): a workspace whose claim never completed
// has no location and no scan. Home must not promise "evidence and drafts are
// ready" or "the AI team finished the analysis", and must say how to link the
// business; a scanned workspace keeps the existing copy.
describe("HomeBriefView for an unscanned or unlinked workspace (F-19)", () => {
  const openAction = buildActionOverview(actionRow, { location: null, latestRun: null, latestVersion: null });
  function renderWith(locale: "en" | "zh-HK" | "zh-TW", opts: { locations: Array<{ slug: string; name: string }>; locationSlug: string; withSnapshot: boolean; withPriority: boolean }) {
    const brief = { ...baseBrief(null), locationSlug: opts.locationSlug, snapshot: opts.withSnapshot ? snapshot : null, priority: opts.withPriority ? openAction : null, openActions: opts.withPriority ? [openAction] : [] } as HomeBrief;
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <HomeBriefView locale={locale} workspaceSlug="nadagogo" workspaceId="ws-1" workspaceName="Nadagogo" tier="lite" timezone="Asia/Hong_Kong" locations={opts.locations} brief={brief} consentPolicyVersion="2026-07-28" role="owner" />,
    );
    return root;
  }

  it.each(["en", "zh-HK", "zh-TW"] as const)("no location: no ready-work claims and a scan link (%s)", (locale) => {
    const root = renderWith(locale, { locations: [], locationSlug: "all", withSnapshot: false, withPriority: false });
    const text = root.textContent ?? "";
    expect(root.querySelector("h1")?.textContent).toBe(copy[locale].home.noScanTitle);
    expect(text).not.toContain(copy[locale].home.title);
    expect(text).not.toContain(copy[locale].home.subtitle);
    expect(text).not.toMatch(/finished the analysis|已完成分析/);
    expect(text).toContain(copy[locale].home.noLocationTitle);
    expect(root.querySelector(`a[href="/${locale}/scan"]`)?.textContent).toBe(copy[locale].home.noLocationCta);
  });

  it("a single location with no snapshot is also waiting for its first scan", () => {
    const root = renderWith("en", { locations: [{ slug: "main", name: "Main" }], locationSlug: "main", withSnapshot: false, withPriority: false });
    expect(root.querySelector("h1")?.textContent).toBe(copy.en.home.noScanTitle);
    expect(root.textContent).not.toContain(copy.en.home.noLocationTitle);
  });

  it("a scanned location with no open action says so instead of promising drafts", () => {
    const root = renderWith("zh-HK", { locations: [{ slug: "main", name: "Main" }], locationSlug: "main", withSnapshot: true, withPriority: false });
    expect(root.querySelector("h1")?.textContent).toBe(copy["zh-HK"].home.quietTitle);
    expect(root.textContent).not.toContain(copy["zh-HK"].home.subtitle);
  });

  it("keeps the existing headline for an open action even without a snapshot (acceptance home-today)", () => {
    const root = renderWith("en", { locations: [{ slug: "main", name: "Main" }], locationSlug: "main", withSnapshot: false, withPriority: true });
    expect(root.querySelector("h1")?.textContent).toBe(copy.en.home.title);
    expect(root.textContent).not.toContain(copy.en.home.noScanTitle);
  });

  it("keeps the existing headline when there is an open priority action, including the all-locations view", () => {
    for (const locationSlug of ["main", "all"]) {
      const root = renderWith("en", { locations: [{ slug: "main", name: "Main" }], locationSlug, withSnapshot: locationSlug === "main", withPriority: true });
      expect(root.querySelector("h1")?.textContent).toBe(copy.en.home.title);
      expect(root.textContent).toMatch(/finished the analysis/);
    }
  });
});
