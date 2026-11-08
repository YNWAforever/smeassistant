import { describe, expect, it } from "vitest";
import type { Membership } from "@/lib/auth";
import { localized, type FactType } from "@/lib/domain";
import type { SignalRows } from "@/lib/assistant/signals";
import type { WorkspaceContext } from "@/lib/workspace/queries";
import type { HomeBrief } from "@/lib/workspace/queries-pages";
import type { SnapshotRecord, ScanDiffRow } from "@/lib/workspace/snapshots";
import { buildStudioBriefing, renderSystemBriefing, type StudioBrandSnapshot, type StudioBriefingDeps } from "./context";

/**
 * Briefing tests (design §6.1). Every read is a fake: no database, no network.
 * The assertions are about what the briefing is allowed to claim ??a score is
 * copied from the snapshot, a delta only exists when the pair is comparable,
 * and a missing row is never turned into a number.
 */

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_LOCATION_ID = "88888888-8888-4888-8888-888888888888";
const ACTION_ID = "33333333-3333-4333-8333-333333333333";

const membership: Membership = { workspaceId: WORKSPACE_ID, workspaceSlug: "kam-man-house", userId: "user-1", email: "owner@example.test", role: "owner", locationScope: null };

const text = (en: string) => localized(en, en);

function snapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  const measured = { status: "measured" as const, confidence: "high" as const, limitationCode: null, score: 60 };
  return {
    id: "snapshot-1",
    jobId: "job-1",
    workspaceId: WORKSPACE_ID,
    locationId: LOCATION_ID,
    market: "hk",
    observedAt: "2026-08-25T01:42:00Z",
    scoringVersion: "2026.08",
    overallScore: 71.4,
    coverage: 0.78,
    moduleStates: { google_business: measured, instagram: measured, search_ai: measured, website: measured },
    metrics: { "gbp.rating": 4.3 },
    websiteChecks: null,
    comparableTo: null,
    diffId: null,
    createdAt: "2026-08-25T01:45:00Z",
    ...overrides,
  };
}

const diff: ScanDiffRow = {
  id: "diff-1",
  base_job_id: "job-0",
  head_job_id: "job-1",
  comparable: true,
  incomparable_reason: null,
  composite_withheld_reason: null,
  intersection_modules: ["gbp"],
  composite_base: 66,
  composite_head: 71,
  composite_delta: 5,
  resolved_findings: [],
  regressed_findings: [],
  decayed_findings: [],
  lost_coverage: [],
  gained_coverage: [],
  created_at: "2026-08-25T01:45:00Z",
};

function action(overrides: Partial<HomeBrief["openActions"][number]> = {}): HomeBrief["openActions"][number] {
  return {
    id: ACTION_ID,
    templateKey: "review-response",
    capability: "Live",
    delivery: "export_copy",
    location: { id: LOCATION_ID, slug: "yik-yam", name: text("Yik Yam") },
    title: text("Reply to unanswered Google reviews"),
    summary: text("Seven reviews await a reply."),
    evidence: { factType: "Observed" as FactType, source: "Google Business", value: "7 unanswered", detail: text(""), observedAt: "2026-08-25T01:42:00Z", freshness: text("") },
    priority: "high",
    priorityFactors: [{ key: "severity", label: text("Severity"), points: 30 }],
    effortMinutes: 15,
    requiredInputs: ["brand_voice"],
    missingInputs: ["brand_voice"],
    blockingInputs: ["brand_voice"],
    actionState: "needs_input",
    runState: "succeeded",
    approvalState: "draft",
    deliveryState: "not_requested",
    measurementState: "not_eligible",
    applied: false,
    appliedOn: null,
    verified: false,
    verifiedOn: null,
    displayPhase: text("Needs details"),
    displayPhaseKey: "needs_input",
    createdAt: "2026-08-25T02:00:00Z",
    updatedAt: "2026-08-25T02:00:00Z",
    ...overrides,
  };
}

function workspaceContext(overrides: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return {
    workspace: {
      id: WORKSPACE_ID,
      slug: "kam-man-house",
      name: "Kam Man House",
      market: "hk",
      tier: "paid",
      timezone: "Asia/Hong_Kong",
      isDemo: false,
      instagramHandle: "kammanhouse",
      industry: "餐飲",
      district: "灣仔",
    },
    locations: [
      { id: LOCATION_ID, slug: "yik-yam", name: "Yik Yam", address: null, district: null, isPrimary: true, placeId: "place-1" },
      { id: OTHER_LOCATION_ID, slug: "tin-hau", name: "Tin Hau", address: null, district: null, isPrimary: false, placeId: "place-2" },
    ],
    usage: { period: "2026-08", approvedDeliveries: 2, allowance: 20 },
    unreadNotifications: 0,
    membership,
    account: { name: "Owner", email: "owner@example.test" },
    ...overrides,
  };
}

function homeBrief(overrides: Partial<HomeBrief> = {}): HomeBrief {
  return {
    locationSlug: "yik-yam",
    location: { id: LOCATION_ID, slug: "yik-yam", name: "Yik Yam", address: null, district: null, isPrimary: true, placeId: "place-1" },
    snapshot: snapshot(),
    changed: { factType: "Observed", delta: 5, base: 66, head: 71, reason: null, comparable: true },
    priority: action(),
    openActions: [action()],
    openActionCount: 1,
    proof: null,
    month: { resolved: 0, regressed: 0, awaitingApproval: 0, completed: 0, measured: 0 },
    rescanCadenceDay: null,
    drafts: 0,
    agentStrip: { scout: true, priority: true, drafts: 0, awaiting: 0 },
    ledger: { resolved: [], regressed: [], decayed: [] },
    integrations: {
      google: { status: "active", expiresAt: null, updatedAt: null },
      instagram: { handle: "kammanhouse", state: "measured", limitationCode: null },
      website: { state: "measured", checksPassed: 9, checksEvaluated: 12, observedAt: "2026-08-25T01:42:00Z" },
    },
    evidence: [],
    ...overrides,
  };
}

const signalRows: SignalRows = {
  actions: [],
  waitingVersions: [
    { id: "version-1", actionId: ACTION_ID, versionNo: 2, approvalState: "draft", createdAt: "2026-08-24T00:00:00Z", locationId: LOCATION_ID },
    { id: "version-2", actionId: ACTION_ID, versionNo: 3, approvalState: "changes_requested", createdAt: "2026-08-23T00:00:00Z", locationId: OTHER_LOCATION_ID },
  ],
  google: "expired",
};

const brand: StudioBrandSnapshot = {
  current_revision_id: "brand-rev-1",
  voice: "warm",
  approved_claims: ["family recipe since 1998"],
  prohibited_terms: ["cheapest"],
  languages: ["zh-HK"],
  facts: { address: "1 Yik Yam Street", opening_hours: "11:00-22:00" },
};

function deps(overrides: Partial<StudioBriefingDeps> = {}): StudioBriefingDeps {
  return {
    loadWorkspaceContext: async (member) => workspaceContext({ membership: member }),
    getHomeBrief: async () => homeBrief(),
    loadSignalRows: async () => signalRows,
    assistantBrand: async () => brand,
    loadSnapshots: async () => [snapshot(), snapshot({ id: "snapshot-0", jobId: "job-0", overallScore: 68 })],
    loadDiff: async () => diff,
    buildEvidenceRefs: () => [
      { evidenceId: "ev_scan_score", scanId: "job-1", factType: "Observed", label: "Visibility score", value: "71/100", observedAt: "2026-08-25T01:42:00Z", source: "SME Scanner" },
      { evidenceId: "ev_scan_coverage", scanId: "job-1", factType: "Observed", label: "Measured coverage", value: "78%", observedAt: "2026-08-25T01:42:00Z", source: "SME Scanner" },
    ],
    now: () => new Date("2026-11-08T00:00:00Z"),
    ...overrides,
  };
}

const input = (overrides: Partial<Parameters<typeof buildStudioBriefing>[0]> = {}) => ({ membership, locale: "en" as const, deps: deps(), ...overrides });

describe("buildStudioBriefing", () => {
  it("copies the score, coverage and observed time from the snapshot instead of recomputing them", async () => {
    const result = await buildStudioBriefing(input());
    expect(result.briefing.latestScan).toMatchObject({ score: 71.4, coverage: 0.78, observedAt: "2026-08-25T01:42:00Z", scoringVersion: "2026.08", factType: "Observed" });
    expect(result.contextSummary.latestScan).toMatchObject({ score: "71/100", coverage: "78%", observedAt: "2026-08-25T01:42:00Z" });
    expect(result.systemBriefing).toContain("score 71/100");
    expect(result.systemBriefing).toContain("coverage 78%");
  });

  it("keeps a withheld score withheld instead of inventing one", async () => {
    const withheld = snapshot({ overallScore: null });
    const result = await buildStudioBriefing(input({ deps: deps({ getHomeBrief: async () => homeBrief({ snapshot: withheld }) }) }));
    expect(result.briefing.latestScan).toMatchObject({ score: null, factType: "Unknown" });
    expect(result.contextSummary.latestScan?.score).toBeNull();
    expect(result.systemBriefing).toContain("score withheld");
  });

  it("states a missing snapshot as unavailable and never fills in numbers", async () => {
    const result = await buildStudioBriefing(input({ deps: deps({ getHomeBrief: async () => homeBrief({ snapshot: null, changed: { factType: "Unknown", delta: null, base: null, head: null, reason: "NO_DIFF", comparable: false }, priority: null, openActions: [], openActionCount: 0 }) }) }));
    expect(result.briefing.latestScan).toBeNull();
    expect(result.briefing.change).toBeNull();
    expect(result.briefing.evidenceCatalogue).toEqual([]);
    expect(result.contextSummary.latestScan).toBeNull();
    expect(result.systemBriefing).toContain("LATEST SNAPSHOT: unavailable");
    expect(result.systemBriefing).not.toMatch(/\b\d+\/100\b/);
  });

  it("only reports an observed delta when scan_diffs declares the pair comparable", async () => {
    const observed = await buildStudioBriefing(input());
    expect(observed.briefing.change).toEqual({ comparable: true, factType: "Observed", delta: 5, reason: null });
    expect(observed.systemBriefing).toContain("+5 points Observed");

    const incomparable = await buildStudioBriefing(input({ deps: deps({ loadDiff: async () => ({ ...diff, comparable: false, incomparable_reason: "SCORING_VERSION_MISMATCH", composite_delta: null }) }) }));
    expect(incomparable.briefing.change).toEqual({ comparable: false, factType: "Unknown", delta: null, reason: "SCORING_VERSION_MISMATCH" });
    expect(incomparable.systemBriefing).toContain("do not draw a delta");

    const withheld = await buildStudioBriefing(input({ deps: deps({ loadDiff: async () => ({ ...diff, composite_withheld_reason: "INSUFFICIENT_INDEPENDENT_CHANNELS" }) }) }));
    expect(withheld.briefing.change).toMatchObject({ comparable: true, factType: "Unknown", delta: 5 });
    expect(withheld.systemBriefing).toContain("composite delta is withheld");
  });

  it("withholds a mixed evidence pair instead of relabelling it", async () => {
    const head = snapshot({ comparableTo: "snapshot-1", diffId: "diff-1" });
    const result = await buildStudioBriefing(input({
      deps: deps({
        getHomeBrief: async () => homeBrief({ snapshot: head }),
        loadSnapshots: async () => [head, snapshot({ id: "snapshot-1", jobId: "job-other" })],
      }),
    }));
    expect(result.briefing.change).toEqual({ comparable: false, factType: "Unknown", delta: null, reason: "NO_DIFF" });
    expect(result.briefing.evidenceCatalogue.length).toBeGreaterThan(0);
    expect(result.systemBriefing).toContain("do not draw a delta");
  });

  it("bounds open actions to eight, keeps the full count, and flags missing inputs", async () => {
    const many = Array.from({ length: 12 }, (_, index) => action({ id: `action-${index}` }));
    const result = await buildStudioBriefing(input({ deps: deps({ getHomeBrief: async () => homeBrief({ openActions: many, openActionCount: 12 }) }) }));
    expect(result.briefing.openActions).toHaveLength(8);
    expect(result.briefing.openActionCount).toBe(12);
    expect(result.contextSummary.openActions).toHaveLength(8);
    expect(result.contextSummary.pendingInputs).toBe(8);
  });

  it("filters waiting versions by the manager's location scope", async () => {
    const scoped: Membership = { ...membership, role: "manager", locationScope: [LOCATION_ID] };
    const result = await buildStudioBriefing(input({ membership: scoped }));
    expect(result.briefing.waitingVersions.map((version) => version.id)).toEqual(["version-1"]);
    expect(result.contextSummary.waitingVersions).toBe(1);
  });

  it("resolves a location slug, refuses an unknown one, and refuses another manager's location", async () => {
    const bySlug = await buildStudioBriefing(input({ locationSlug: "tin-hau" }));
    expect(bySlug.briefing.location).toEqual({ id: OTHER_LOCATION_ID, slug: "tin-hau", name: "Tin Hau" });

    await expect(buildStudioBriefing(input({ locationSlug: "does-not-exist" }))).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(buildStudioBriefing(input({ locationId: "00000000-0000-4000-8000-000000000000" }))).rejects.toMatchObject({ code: "not_found" });

    const scoped: Membership = { ...membership, role: "manager", locationScope: [LOCATION_ID] };
    await expect(buildStudioBriefing(input({ membership: scoped, locationId: OTHER_LOCATION_ID }))).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  it("builds a bounded evidence catalogue keyed ev:1 ??ev:12", async () => {
    const refs = Array.from({ length: 20 }, (_, index) => ({ evidenceId: `ev_scan_${index}`, scanId: "job-1", factType: "Observed" as const, label: `Metric ${index}`, value: String(index), observedAt: "2026-08-25T01:42:00Z", source: "SME Scanner" }));
    const result = await buildStudioBriefing(input({ deps: deps({ buildEvidenceRefs: () => refs }) }));
    expect(result.evidenceCatalogue).toHaveLength(12);
    expect(result.evidenceCatalogue[0].id).toBe("ev:1");
    expect(result.evidenceCatalogue.at(-1)?.id).toBe("ev:12");
    expect(result.chips).toBe(result.promptChips);
    expect(result.systemBriefing).toContain("ev:1 :: Observed :: Metric 0");
  });

  it("renders the context summary with the request locale and real brand facts only", async () => {
    const zh = await buildStudioBriefing(input({ locale: "zh-HK" }));
    expect(zh.contextSummary.brandFactCount).toBe(2);
    expect(zh.contextSummary.google).toBe("連接已過期");
    expect(zh.contextSummary.locationName).toBe("Yik Yam");
    expect(zh.contextSummary.openActions[0].title).toBe("Reply to unanswered Google reviews");
    expect(zh.systemBriefing).toContain("CONFIRMED BRAND FACTS (2)");
    expect(zh.systemBriefing).toContain("PROHIBITED TERMS: cheapest");

    const empty = await buildStudioBriefing(input({ deps: deps({ assistantBrand: async () => null }) }));
    expect(empty.briefing.brand.facts).toEqual([]);
    expect(empty.contextSummary.brandFactCount).toBe(0);
    expect(empty.systemBriefing).toContain("CONFIRMED BRAND FACTS: none recorded");
  });

  it("offers state-aware chips and never a draft chip to a viewer", async () => {
    const owner = await buildStudioBriefing(input());
    expect(owner.promptChips.map((chip) => chip.id)).toEqual(["starter_priorities", "starter_changed", "starter_missing", "starter_draft"]);

    const viewer = await buildStudioBriefing(input({ membership: { ...membership, role: "viewer" } }));
    expect(viewer.promptChips.map((chip) => chip.id)).not.toContain("starter_draft");

    const noChange = await buildStudioBriefing(input({ deps: deps({ loadDiff: async () => null, getHomeBrief: async () => homeBrief({ changed: { factType: "Unknown", delta: null, base: null, head: null, reason: "NO_DIFF", comparable: false } }) }) }));
    expect(noChange.promptChips.map((chip) => chip.id)).not.toContain("starter_changed");
  });

  it("renders the system briefing purely from the briefing object", async () => {
    const { briefing } = await buildStudioBriefing(input());
    const rendered = renderSystemBriefing(briefing, "en");
    expect(rendered).toContain("WORKSPACE: Kam Man House");
    expect(rendered).toContain("CALLER ROLE: owner");
    expect(rendered).toContain("OPEN ACTIONS (1 shown of 1");
    expect(rendered).toContain("WAITING VERSIONS (2)");
    expect(rendered).toContain("GOOGLE CONNECTION: expired");
    expect(rendered).toContain("USAGE: period 2026-08");
  });
});
