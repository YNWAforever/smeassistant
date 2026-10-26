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
    month: { resolved: null, regressed: null, awaitingApproval: 0, completed: 0, measured: 0 },
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

describe("returning owner version-bound follow-up", () => {
  const followUp: NonNullable<HomeBrief["reviewFollowUp"]> = {
    workspaceId: "ws-1", actionId: "applied-review", locationId: "loc-1",
    title: { en: "Synthetic review reply", "zh-HK": "合成評論回覆", "zh-TW": "合成評論回覆" },
    actionState: "completed", versionId: "saved-v2", versionNo: 2,
    approvalState: "approved", deliveryState: "exported",
    appliedAt: "2026-10-01T00:00:00Z", currentCheck: null, canRecord: true,
    newerDraft: { id: "draft-v3", versionNo: 3 },
  };
  function home(candidate: HomeBrief["reviewFollowUp"], role: "owner" | "viewer" = "owner") {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(<HomeBriefView locale="en" workspaceSlug="synthetic"
      workspaceId="ws-1" workspaceName="Synthetic merchant" tier="lite" timezone="Asia/Hong_Kong"
      locations={[{ slug: "central", name: "Synthetic Central" }]} role={role}
      consentPolicyVersion="2026-07-28"
      brief={{ ...baseBrief(null), locationSlug: "central", reviewFollowUp: candidate } as HomeBrief} />);
    return root;
  }
  it("keeps completed V2 visible for a check while V3 remains a separate draft and pins both links", () => {
    const root = home(followUp);
    const card = root.querySelector('[data-testid="home-review-followup"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Version 2");
    expect(card?.textContent).toContain("Applied (reported)");
    expect(card?.textContent).toContain("Completed");
    expect(card?.querySelector('a[data-next-check]')?.getAttribute("href"))
      .toBe("/en/owner/synthetic/actions/applied-review?version=saved-v2&location=central");
    expect(card?.querySelector('a[data-newer-draft]')?.getAttribute("href"))
      .toBe("/en/owner/synthetic/actions/applied-review?version=draft-v3&location=central");
    expect(card?.textContent).toMatch(/Version 3.*draft/i);
    expect(root.textContent).not.toContain("No action needs your decision right now");
  });
  it("shows a read-only next step, hides foreign workspace follow-ups and keeps the true empty state", () => {
    expect(home(followUp, "viewer").textContent).toContain("View saved check");
    const foreign = home({ ...followUp, workspaceId: "another-workspace", title: { en: "Foreign secret", "zh-HK": "私密", "zh-TW": "私密" } });
    expect(foreign.textContent).not.toContain("Foreign secret");
    expect(foreign.querySelector('[data-testid="home-review-followup"]')).toBeNull();
    expect(home(null).textContent).toContain("No action needs your decision right now");
  });
  it.each([
    ["checked", "Owner checked · statement only", "Await independent confirmation"],
    ["not_found", "Not found / content differs", "Locate the correct review"],
    ["later", "Check deferred", "three manual checks"],
    ["retracted", "Owner check withdrawn", "three manual checks"],
  ] as const)("shows the %s owner's next step while preserving Completed and pending independent verification", (decision, label, next) => {
    const root = home({ ...followUp, currentCheck: { id: "1", decision, recordedAt: "2026-10-19T03:00:00Z" } });
    const card = root.querySelector('[data-testid="home-review-followup"]');
    expect(card?.textContent).toContain(label);
    expect(card?.textContent).toContain(next);
    expect(card?.textContent).toContain("Completed");
    expect(card?.textContent).toContain("Independent verification is pending");
    expect(card?.querySelector('a[data-next-check]')?.getAttribute("href")).toContain("version=saved-v2");
  });
});

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

// Phase 4: the Fix Pack drafts and the starter pack moved to Actions (Fix Pack view, New › Starter pack).
describe("HomeBriefView without Fix Pack or starter pack cards (Phase 4)", () => {
  it("renders neither card on Today", () => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(<HomeBriefView locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" workspaceName="Kam Man House" tier="paid" timezone="Asia/Hong_Kong" locations={[{ slug: "yik-yam", name: "Yik Yam" }]} brief={baseBrief(null)} consentPolicyVersion="2026-07-28" />);
    expect(root.querySelector(".fix-pack-card")).toBeNull();
    expect(root.querySelector(".pack-card")).toBeNull();
    expect(root.textContent).not.toContain("Visibility starter pack");
  });
});

/**
 * FA-04: home leads with the one thing to do today; the methodology stays one
 * tap away inside a closed 「點解咁講」 disclosure.
 */
describe("HomeBriefView today-first layout (FA-04)", () => {
  function priority(missing: string[] = []) {
    return buildActionOverview(
      { ...actionRow, required_inputs: missing, provided_inputs: {} },
      { location: { id: actionRow.location_id, slug: "yik-yam", name: { en: "Yik Yam", "zh-HK": "奕蔭街", "zh-TW": "奕蔭街" } }, latestRun: null, latestVersion: null },
    );
  }
  function view(opts: { locale?: "en" | "zh-HK" | "zh-TW"; tier?: "lite" | "paid"; role?: "owner" | "manager" | "viewer"; priority?: ReturnType<typeof priority> | null; withSnapshot?: boolean; openActionCount?: number; openActions?: HomeBrief["openActions"]; gettingStarted?: ReactNode } = {}) {
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
        gettingStarted={opts.gettingStarted}
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

  it("keeps evidence and results closed so the priority action owns the daily view", () => {
    const root = view({ withSnapshot: true });
    for (const selector of [".why-now-box", ".brief-score-card", ".brief-proof-card", ".month-brief"]) {
      const disclosure = root.querySelector(selector)?.closest("details");
      expect(disclosure, selector).not.toBeNull();
      expect(disclosure?.hasAttribute("open"), selector).toBe(false);
    }
    expect(root.querySelector(".brief-priority-actions a")?.closest("details")).toBeNull();
    expect(root.querySelector(".brief-priority-card h2")?.closest("details")).toBeNull();
  });

  it("shows other tasks as one count and one link, without repeating cards or creation routes", () => {
    const root = view({ openActionCount: 37, openActions: [priority()] });
    const tasks = root.querySelector(".owner-tasks-disclosure");
    expect(tasks?.textContent).toContain("37");
    expect(tasks?.querySelectorAll("a")).toHaveLength(1);
    expect(tasks?.querySelector("a")?.getAttribute("href")).toBe("/en/owner/kam-man-house/actions?location=yik-yam");
    expect(tasks?.querySelector(".compact-action-list")).toBeNull();
    expect(root.querySelector(".brief-priority-actions a")?.closest("details")).toBeNull();
  });

  it("shows recent results as one sentence and one Insights link without scores", () => {
    const results = view({ withSnapshot: true }).querySelector(".owner-results-disclosure");
    expect(results?.querySelectorAll("p")).toHaveLength(1);
    expect(results?.querySelectorAll("a")).toHaveLength(1);
    expect(results?.querySelector("a")?.getAttribute("href")).toBe("/en/owner/kam-man-house/insights?location=yik-yam");
    expect(results?.querySelector(".brief-score-card")).toBeNull();
  });

  it("takes an existing draft straight to review instead of promising a new start", () => {
    const action = { ...priority(), latestVersion: { id: "version-1", versionNo: 2, approvalState: "draft" as const, deliveryState: "not_requested" as const } };
    const link = view({ priority: action }).querySelector(".brief-priority-actions a");
    expect(link?.textContent).toContain("Review draft");
    expect(link?.getAttribute("href")).toContain("/actions/");
  });

  it.each(["owner", "manager", "viewer"] as const)("offers an approved version only within the %s role", (role) => {
    const action = { ...priority(), latestVersion: { id: "version-1", versionNo: 2, approvalState: "approved" as const, deliveryState: "export_ready" as const } };
    const link = view({ priority: action, role }).querySelector(".brief-priority-actions a");
    expect(link?.textContent).toContain(role === "viewer" ? "View task" : "Copy text");
    expect(link?.getAttribute("href")).toContain("/actions/");
    if (role === "viewer") expect(link?.textContent).not.toContain("Export");
  });

  it("does not invite another export once the approved version has been exported", () => {
    const action = { ...priority(), latestVersion: { id: "version-1", versionNo: 2, approvalState: "approved" as const, deliveryState: "exported" as const } };
    expect(view({ priority: action, role: "owner" }).querySelector(".brief-priority-actions a")?.textContent).toContain("View task");
  });

  it("leads zh-HK with 而家最應做 and one sentence, and keeps workflow chrome folded", () => {
    const root = view({ locale: "zh-HK" });
    expect(root.querySelector("h1")?.textContent).toBe("而家最應做");
    expect(root.querySelector(".page-intro p:not(.eyebrow)")).toBeNull();
    const card = root.querySelector(".brief-priority-card");
    expect(card?.querySelector("h2")?.textContent).toBe("回覆未回覆的 Google 評論");
    expect(card?.querySelector(".coach-sentence")?.textContent).toBe("7 則評論等待回覆。");
    expect(card?.querySelector(".brief-action-meta")).toBeNull();
    expect(card?.querySelector(".brief-priority-actions a")?.closest("details")).toBeNull();
    const why = root.querySelector("details.owner-priority-evidence");
    expect(why?.hasAttribute("open")).toBe(false);
    expect(why?.querySelector(".brief-action-meta")).not.toBeNull();
    expect(view({ locale: "en" }).querySelector("h1")?.textContent).toBe("Start with this today.");
    expect(view({ locale: "zh-TW" }).querySelector("h1")?.textContent).toBe("今天先處理這一項");
  });

  it("names one verb on the card's button: Start, or Add the missing facts when inputs are missing", () => {
    expect(view({ priority: priority() }).querySelector(".brief-priority-actions a")?.textContent).toContain("Start");
    expect(view({ priority: priority(["opening_hours"]) }).querySelector(".brief-priority-actions a")?.textContent).toContain("Add the missing facts");
    expect(view({ locale: "zh-HK", priority: priority() }).querySelector(".brief-priority-actions a")?.textContent).toContain("開始處理");
  });

  it("folds the methodology into one closed 「點解咁講」 disclosure", () => {
    const disclosure = view().querySelector("details.trust-disclosure");
    expect(disclosure).not.toBeNull();
    expect(disclosure!.hasAttribute("open")).toBe(false);
    expect(disclosure!.querySelector("summary")?.textContent).toContain("Why you can trust this");
    for (const inside of [".brief-score-card", ".brief-proof-card", ".month-brief", ".why-now-box", ".workspace-agent-strip", ".integration-health-card", ".change-ledger-card", ".operational-footnote"]) {
      expect(disclosure!.querySelector(inside)).not.toBeNull();
    }
    expect(view({ locale: "zh-HK" }).querySelector("details.trust-disclosure summary")?.textContent).toContain("點解咁講");
  });

  it("shows the full count in every locale without a bounded card preview", () => {
    const actions = [0, 1, 2].map((index) => ({ ...priority(), id: `action-${index}` }));
    for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
      const tasks = view({ locale, openActionCount: 37, openActions: actions }).querySelector(".owner-tasks-disclosure");
      expect(tasks?.textContent).toContain("37");
      expect(tasks?.querySelectorAll("a")).toHaveLength(1);
      expect(tasks?.querySelector(".compact-action-list")).toBeNull();
    }
  });

  it("only puts the next setup step under the coach when there is no task yet", () => {
    const marker = <div data-testid="next-setup">Next setup</div>;
    const empty = view({ priority: null, gettingStarted: marker });
    const step = empty.querySelector('[data-testid="next-setup"]');
    expect(step).not.toBeNull();
    expect(step?.closest("details")).toBeNull();
    expect(view({ gettingStarted: marker }).querySelector('[data-testid="next-setup"]')).toBeNull();
    expect(view({ priority: null, openActionCount: 1, gettingStarted: marker }).querySelector('[data-testid="next-setup"]')).toBeNull();
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
    expect(view({ locale: "zh-HK", priority: null, withSnapshot: true, tier: "lite" }).querySelector(".brief-priority-card")?.textContent).toContain("今個星期冇新嘢。下次掃完再睇。");
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

describe("zh-HK shop language when the score is withheld", () => {
  it("leads with the data gap and keeps the zero rule under 點解咁講", () => {
    const brief = baseBrief(null);
    brief.snapshot = { ...snapshot, overallScore: null, coverage: 0.6 };
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <HomeBriefView
        locale="zh-HK"
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        workspaceName="Kam Man House"
        tier="paid"
        timezone="Asia/Hong_Kong"
        locations={[{ slug: "yik-yam", name: "奕蔭街" }]}
        brief={brief}
        consentPolicyVersion="2026-07-28"
        role="owner"
      />,
    );
    const score = root.querySelector(".brief-score-card");
    expect(score?.querySelector("h2")?.textContent).toBe("資料未夠，暫時未評");
    expect(score?.textContent).toContain("呢次查到 60% 資料");
    expect(score?.textContent).not.toContain("唔會當零分");
    const trust = root.querySelector("details.trust-disclosure");
    expect(trust?.hasAttribute("open")).toBe(false);
    expect(trust?.querySelector("summary")?.textContent).toContain("點解咁講");
    expect(trust?.textContent).toContain("唔會當零分");
    expect(trust?.textContent).toContain("唔會自動發佈");
    const text = root.textContent ?? "";
    expect(text).not.toContain("AI 能見度團隊");
    expect(text).not.toContain("覆蓋率");
    expect(text).not.toContain("快照");
    expect(root.querySelector("h1")?.textContent).toBe("而家冇嘢要你決定");
  });
});

describe("month metrics without a comparable scan (guardrail 2)", () => {
  it("shows resolved and regressed as unknown, never 0", () => {
    const metrics = Array.from(render(null).querySelectorAll(".month-metrics article")).slice(0, 2);
    for (const card of metrics) {
      expect(card.querySelector("strong")?.textContent).toBe("—");
      expect(card.textContent).toContain(copy.en.home.noComparable);
    }
  });
  it("draws a flat glyph, not an up-trend, when there is no comparable change", () => {
    const label = render(null).querySelector(".brief-score-card .card-label-row");
    expect(label?.querySelector('[data-trend="flat"]')).not.toBeNull();
    expect(label?.querySelector('[data-trend="up"]')).toBeNull();
  });
});
