import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceContext } from "@/lib/workspace/queries";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  snapshots: [] as Row[],
  diffs: {} as Record<string, Row>,
  actions: [] as Row[],
  measurements: [] as Row[],
  versions: [] as Row[],
  completed: [] as Row[],
  schedule: null as Row | null,
  connections: [] as Row[],
  runs: [] as Row[],
  brand: { workspaceId: "ws-1", voice: "warm", approvedClaims: [] as string[], prohibitedTerms: [] as string[], languages: ["zh-HK"] as string[], facts: {} as Record<string, string>, updatedAt: null as string | null },
  asset: null as Row | null,
  deliveries: [] as Row[],
}));

vi.mock("server-only", () => ({}));
const evidenceMock = vi.hoisted(() => ({ loadAuthorizedEvidence: vi.fn(async () => ({ items: [] as unknown[] })) }));
vi.mock("@/lib/evidence/load-authorized", () => ({ loadAuthorizedEvidence: evidenceMock.loadAuthorizedEvidence }));
const repository = vi.hoisted(() => ({
  snapshots: vi.fn(), diff: vi.fn(), actions: vi.fn(), runs: vi.fn(), versions: vi.fn(),
  latestConnection: vi.fn(), measurements: vi.fn(), draftVersions: vi.fn(),
  completedActions: vi.fn(), schedules: vi.fn(), aeoSnapshots: vi.fn(),
  activity: vi.fn(), notifications: vi.fn(), notificationPreferences: vi.fn(),
  deliveries: vi.fn(),
}));
vi.mock("@/lib/repositories/workspace-read", () => ({ workspaceReadRepository: () => repository }));
const applications = vi.hoisted(() => ({ forActions: vi.fn(async () => [] as Array<{ action_id: string; source: string; asserted_at: string }>) }));
vi.mock("@/lib/repositories/applications", () => ({ applicationRepository: () => applications }));
const reaper = vi.hoisted(() => ({ reapStrandedRuns: vi.fn(async () => [] as string[]) }));
vi.mock("@/lib/workspace/run-reaper", () => ({ reapStrandedRuns: reaper.reapStrandedRuns }));
type FakeSnapshot = { id: string; jobId: string; workspaceId: string; locationId: string | null; observedAt: string; metrics: Record<string, number> };
const artifacts = vi.hoisted(() => ({
  assistantSnapshot: vi.fn(async () => null as unknown),
  assistantLatestSnapshot: vi.fn(async () => null as unknown),
  assistantReviewData: vi.fn(async () => null as unknown),
  assistantAeoQueries: vi.fn(async () => [] as string[]),
}));
vi.mock("@/lib/repositories/artifacts", () => ({ artifactRepository: () => artifacts }));
const brandMock = vi.hoisted(() => ({ getBrand: vi.fn(async () => state.brand) }));
vi.mock("@/lib/workspace/brand", () => ({ getBrand: brandMock.getBrand }));
const assetsMock = vi.hoisted(() => ({ get: vi.fn(async () => state.asset) }));
vi.mock("@/lib/repositories/assets", () => ({ assetRepository: () => assetsMock }));
const mailOutboxMock = vi.hoisted(() => ({ memberSwitches: vi.fn() }));
vi.mock("@/lib/repositories/mail-outbox", () => ({ mailOutboxRepository: () => mailOutboxMock }));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({}) }));
const mailAvailabilityMock = vi.hoisted(() => ({ mailAvailability: vi.fn() }));
vi.mock("@/lib/mail/availability", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/mail/availability")>()), mailAvailability: mailAvailabilityMock.mailAvailability }));

import { getHomeBrief, getInsights, listActions, getActivity, getIntegrations, getAction, loadActionRows, loadDiffById, getNotifications } from "./queries-pages";

const ctx: WorkspaceContext = {
  workspace: { id: "ws-1", slug: "kam-man-house", name: "Kam Man House", market: "hk", tier: "paid", timezone: "Asia/Hong_Kong", isDemo: false, instagramHandle: null, industry: "fnb", district: null },
  locations: [
    { id: "loc-1", slug: "yik-yam", name: "Yik Yam Street", address: null, district: null, isPrimary: true, placeId: "place-1" },
    { id: "loc-2", slug: "tin-hau", name: "Tin Hau", address: null, district: null, isPrimary: false, placeId: null },
  ],
  usage: { period: "2026-09", approvedDeliveries: 0, allowance: null },
  unreadNotifications: 0,
  membership: { workspaceId: "ws-1", workspaceSlug: "kam-man-house", userId: "u1", email: "o@example.test", role: "owner", locationScope: null },
  account: { name: "o", email: "o@example.test" },
};

const snapshotRow = (over: Row): Row => ({
  id: "snap-1", job_id: "job-1", workspace_id: "ws-1", location_id: "loc-1", market: "hk", observed_at: "2026-09-01T00:00:00Z", scoring_version: "2026-08-16",
  overall_score: 62, coverage: 0.78, module_states: null, metrics: { "gbp.rating": 4.2 }, website_checks: null, comparable_to: null, diff_id: null, created_at: "2026-09-01T00:00:00Z", ...over,
});

const actionRow = (over: Row): Row => ({
  id: "a1", workspace_id: "ws-1", location_id: "loc-1", template_key: "review-response", source: "finding", source_finding_keys: [], title: { en: "t", "zh-HK": "t", "zh-TW": "t" },
  summary: { en: "s", "zh-HK": "s", "zh-TW": "s" }, evidence: {}, priority: "urgent", priority_score: 61, priority_factors: [], effort_minutes: 10, required_inputs: ["brand_voice"], provided_inputs: {},
  assignee_user_id: null, due_at: null, action_state: "needs_input", measurement_state: "not_eligible", capability: "Live", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repository.snapshots.mockImplementation(async (_workspaceId, locationId) => state.snapshots.filter(row => row.location_id === locationId));
  repository.diff.mockImplementation(async id => state.diffs[id] ?? null);
  // E28: mirror repository WHERE predicates; a states filter cannot return all.
  repository.actions.mockImplementation(async (workspaceId, opts: { locationId?: string | null; states?: string[]; ids?: string[] } = {}) => state.actions.filter(row =>
    row.workspace_id === workspaceId && (!opts.locationId || row.location_id === opts.locationId || row.location_id == null)
    && (!opts.states || opts.states.includes(row.action_state as string)) && (!opts.ids || opts.ids.includes(row.id as string))));
  repository.runs.mockImplementation(async () => state.runs);
  repository.versions.mockImplementation(async () => state.versions);
  repository.latestConnection.mockImplementation(async () => state.connections[0] ?? null);
  repository.measurements.mockImplementation(async () => state.measurements);
  repository.draftVersions.mockImplementation(async () => state.versions);
  repository.completedActions.mockImplementation(async () => state.completed);
  repository.schedules.mockImplementation(async () => state.schedule ? [state.schedule] : []);
  repository.aeoSnapshots.mockResolvedValue([]);
  repository.activity.mockResolvedValue([]);
  repository.notifications.mockResolvedValue([]);
  repository.notificationPreferences.mockResolvedValue(null);
  repository.deliveries.mockImplementation(async () => state.deliveries);
  brandMock.getBrand.mockImplementation(async () => state.brand);
  assetsMock.get.mockImplementation(async () => state.asset);
  mailOutboxMock.memberSwitches.mockResolvedValue(null);
  mailAvailabilityMock.mailAvailability.mockReturnValue({ open: true });

  state.snapshots = [snapshotRow({})];
  state.diffs = {}; state.actions = [actionRow({}), actionRow({ id: "a2", template_key: "social-post", priority: "high", priority_score: 45, action_state: "recommended", required_inputs: [] })];
  state.measurements = []; state.versions = []; state.completed = []; state.schedule = { next_run_at: "2026-09-14T00:00:00Z", cadence: "monthly", anniversary_day: 14 }; state.connections = [{ status: "active" }]; state.runs = [];
  state.brand = { workspaceId: "ws-1", voice: "warm", approvedClaims: [], prohibitedTerms: [], languages: ["zh-HK"], facts: {}, updatedAt: null };
  state.asset = null;
  state.deliveries = [];
});

describe("getHomeBrief", () => {
  it("passes a trusted local month with an exclusive next-month boundary (T-10)", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T16:00:00Z"));
    try {
      await getHomeBrief(ctx, "all");
      expect(repository.completedActions).toHaveBeenCalledWith("ws-1", { period: "2026-10", startLocalDate: "2026-10-01", endLocalDate: "2026-11-01", timezone: "Asia/Hong_Kong" }, null);
    } finally { vi.useRealTimers(); }
  });

  it("never aggregates for location=all: no snapshot, actions still listed", async () => {
    const brief = await getHomeBrief(ctx, "all");
    expect(brief.snapshot).toBeNull();
    expect(brief.changed.factType).toBe("Unknown");
    expect(brief.openActions.length).toBe(2);
    expect(brief.locationSlug).toBe("all");
    expect(brief.evidence).toEqual([]);
  });

  it("carries signed evidence for the snapshot's job (at most 6) and degrades to an empty gallery when the loader fails", async () => {
    const item = { id: "ev-1", provider: "instagram", evidenceType: "post", sourceUrl: null, mediaUrl: "https://x.test/signed", capturedAt: "2026-09-01T00:00:00Z", publishedAt: null, text: null, metadata: {}, status: "stored", limitationCode: null };
    evidenceMock.loadAuthorizedEvidence.mockResolvedValueOnce({ items: Array.from({ length: 8 }, (_, i) => ({ ...item, id: `ev-${i}` })) });
    const brief = await getHomeBrief(ctx, "yik-yam");
    expect(evidenceMock.loadAuthorizedEvidence).toHaveBeenCalledWith("job-1");
    expect(brief.evidence).toHaveLength(6);

    evidenceMock.loadAuthorizedEvidence.mockRejectedValueOnce(new Error("evidence_signing_failed"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await getHomeBrief(ctx, "yik-yam")).evidence).toEqual([]);
    spy.mockRestore();
  });

  it("reads the change from scan_diffs and reports incomparable reasons", async () => {
    state.snapshots = [snapshotRow({ diff_id: "d1" })];
    state.diffs.d1 = { id: "d1", comparable: false, incomparable_reason: "SCORING_VERSION_MISMATCH", composite_withheld_reason: null, composite_base: 66, composite_head: 62, composite_delta: -4, resolved_findings: [], regressed_findings: [], decayed_findings: [] };
    const brief = await getHomeBrief(ctx, "yik-yam");
    expect(repository.diff).toHaveBeenCalledWith("d1", "ws-1", "job-1");
    expect(brief.snapshot?.id).toBe("snap-1");
    expect(brief.changed).toMatchObject({ factType: "Unknown", delta: null, reason: "SCORING_VERSION_MISMATCH", comparable: false });
    // A recurring day, never a stored date: `scan_schedules.next_run_at` is
    // written once and never advanced, so a date would drift into the past
    // while still being presented as the next scan.
    expect(brief.rescanCadenceDay).toBe(14);
    expect(brief.priority?.id).toBe("a1");
    state.diffs.d1 = { ...state.diffs.d1, comparable: true, incomparable_reason: null, resolved_findings: ["gbp.rating_low"], regressed_findings: ["gbp.owner_response_low"] };
    const comparable = await getHomeBrief(ctx, "yik-yam");
    expect(comparable.changed).toMatchObject({ factType: "Observed", delta: -4, comparable: true });
    expect(comparable.month.resolved).toBe(1);
    expect(comparable.month.regressed).toBe(1);
  });
});

describe("listActions", () => {
  it("keeps scoped counts identical across every active tab with a faithful state filter (T-09)", async () => {
    state.actions.push(actionRow({ id: "done", action_state: "completed" }), actionRow({ id: "dismissed", action_state: "dismissed" }), actionRow({ id: "other", workspace_id: "other-workspace", action_state: "completed" }));
    const baseline = await listActions(ctx, { location: "all" });
    expect(baseline.counts).toMatchObject({ all: 2, needs_input: 1, completed: 1 });
    for (const view of ["all", "needs_input", "drafts", "awaiting_approval", "completed"] as const) {
      expect((await listActions(ctx, { location: "all", view })).counts).toEqual(baseline.counts);
    }
    const instagram = await listActions(ctx, { channel: "instagram", view: "completed" });
    expect(instagram.counts).toMatchObject({ all: 1, needs_input: 0, completed: 0 });
    const completed = await listActions(ctx, { status: "completed", view: "completed" });
    expect(completed.counts).toMatchObject({ all: 0, completed: 1 });
  });

  it("counts the tabs and applies view and channel filters", async () => {
    const all = await listActions(ctx, { location: "all" });
    expect(all.counts).toMatchObject({ all: 2, needs_input: 1, completed: 0 });
    const needsInput = await listActions(ctx, { location: "all", view: "needs_input" });
    expect(needsInput.actions.map((a) => a.id)).toEqual(["a1"]);
    const instagram = await listActions(ctx, { location: "all", channel: "instagram" });
    expect(instagram.actions.map((a) => a.id)).toEqual(["a2"]);
  });

  it("reports the owner's own assertion, and never a verifier's, as applied", async () => {
    applications.forActions.mockResolvedValueOnce([
      { action_id: "a1", source: "verified", asserted_at: "2026-09-13T00:00:00.000Z" },
      { action_id: "a2", source: "owner_asserted", asserted_at: "2026-09-12T00:00:00.000Z" },
    ]);
    const listed = await listActions(ctx, { location: "all" });
    const byId = new Map(listed.actions.map((action) => [action.id, action]));
    // Dormant until a verifier ships, but this is the case that would render a
    // verifier's timestamp as "you marked this applied on {date}".
    expect(byId.get("a1")).toMatchObject({ applied: false, appliedOn: null });
    expect(byId.get("a2")).toMatchObject({ applied: true, appliedOn: "2026-09-12T00:00:00.000Z" });
  });

  it("keeps verified and applied as separate maps from the same forActions rows", async () => {
    applications.forActions.mockResolvedValueOnce([
      { action_id: "a1", source: "verified", asserted_at: "2026-09-13T00:00:00.000Z" },
      { action_id: "a2", source: "owner_asserted", asserted_at: "2026-09-12T00:00:00.000Z" },
    ]);
    const listed = await listActions(ctx, { location: "all" });
    const byId = new Map(listed.actions.map((action) => [action.id, action]));
    // a1 has ONLY a verified row: verified true, applied false.
    expect(byId.get("a1")).toMatchObject({
      verified: true, verifiedOn: "2026-09-13T00:00:00.000Z",
      applied: false, appliedOn: null,
    });
    // a2 has ONLY an owner_asserted row: applied true, verified false.
    expect(byId.get("a2")).toMatchObject({
      applied: true, appliedOn: "2026-09-12T00:00:00.000Z",
      verified: false, verifiedOn: null,
    });
  });
});

describe("getInsights", () => {
  it("binds summary and series diffs to each snapshot job for an accepted viewer", async () => {
    const viewer = { ...ctx, membership: { ...ctx.membership, role: "viewer" as const } };
    state.snapshots = [snapshotRow({ diff_id: "d1" }), snapshotRow({ id: "snap-2", job_id: "job-2", diff_id: "d2" })];
    await getInsights(viewer, "all");
    expect(repository.diff).toHaveBeenCalledWith("d1", "ws-1", "job-1");
    repository.diff.mockClear();
    await getInsights(viewer, "yik-yam");
    expect(repository.diff).toHaveBeenCalledWith("d1", "ws-1", "job-1");
    expect(repository.diff).toHaveBeenCalledWith("d2", "ws-1", "job-2");
  });

  it("returns per-location summaries only for location=all and a series otherwise", async () => {
    const all = await getInsights(ctx, "all");
    expect(all.series).toEqual([]);
    expect(all.perLocation.map((p) => p.location.slug)).toEqual(["yik-yam", "tin-hau"]);
    expect(all.trend.showScores).toBe(false);
    const one = await getInsights(ctx, "yik-yam");
    expect(one.series).toHaveLength(1);
    expect(one.metricCards.find((c) => c.metricKey === "gbp.rating")).toMatchObject({ after: 4.2, factType: "Unknown", delta: null });
  });

  it("shows the approved/exported work itself, not only scores and checks (P2.1 item 7)", async () => {
    state.deliveries = [
      { action_id: "a1", template_key: "review-response", title: { en: "Reply to reviews", "zh-HK": "回覆評論", "zh-TW": "回覆評論" }, version_no: 2, mode: "export", channel: null, delivered_at: "2026-09-05T00:00:00Z" },
    ];
    const one = await getInsights(ctx, "yik-yam");
    expect(repository.deliveries).toHaveBeenCalledWith("ws-1", "loc-1", 20);
    expect(one.deliveries).toEqual(state.deliveries);
  });

  it("never aggregates deliveries across locations for location=all, matching every other per-location field here", async () => {
    state.deliveries = [{ action_id: "a1", template_key: "review-response", title: { en: "x", "zh-HK": "x", "zh-TW": "x" }, version_no: 1, mode: "copy", channel: null, delivered_at: "2026-09-05T00:00:00Z" }];
    const all = await getInsights(ctx, "all");
    expect(all.deliveries).toEqual([]);
    expect(repository.deliveries).not.toHaveBeenCalled();
  });
});


describe("page repository boundaries", () => {
  it("keeps absent diff relations empty and propagates SQL failure", async () => {
    expect(await loadDiffById(null, "ws-1", "job-1")).toBeNull();
    expect(await loadDiffById("d1", "ws-1", null)).toBeNull();
    expect(repository.diff).not.toHaveBeenCalled();
    expect(await loadDiffById("missing", "ws-1", "job-1")).toBeNull();
    repository.diff.mockRejectedValueOnce(new Error("fixture SQL unavailable"));
    await expect(loadDiffById("d1", "ws-1", "job-1")).rejects.toThrow("diff lookup failed");
  });

  it("passes omitted and empty action filters through without broadening them", async () => {
    await loadActionRows("ws-1", { ids: [], states: [] });
    expect(repository.actions).toHaveBeenCalledWith("ws-1", { ids: [], states: [] });
  });

  it("preserves empty activity and explicit zero limit, while surfacing SQL failures", async () => {
    expect(await getActivity(ctx, { limit: 0 })).toEqual([]);
    expect(repository.activity).toHaveBeenCalledWith("ws-1", 0);
    await getActivity(ctx);
    expect(repository.activity).toHaveBeenCalledWith("ws-1", 100);
    repository.activity.mockRejectedValueOnce(new Error("fixture SQL unavailable"));
    await expect(getActivity(ctx)).rejects.toThrow("activity lookup failed");
  });

  it("renders unknown integrations for an empty TW merchant and retains read-only membership", async () => {
    state.connections = [];
    const empty = { ...ctx, workspace: { ...ctx.workspace, market: "tw" as const }, locations: [], membership: { ...ctx.membership, role: "viewer" as const } };
    expect(await getIntegrations(empty)).toEqual({
      google: { status: "not_connected", expiresAt: null, updatedAt: null },
      instagram: { handle: null, state: "unknown", limitationCode: null },
      website: { state: "unknown", checksPassed: null, checksEvaluated: null, observedAt: null },
    });
    expect(repository.snapshots).not.toHaveBeenCalled();
  });

  it("keeps actions readable with no optional versions, runs or measurements", async () => {
    const detail = await getAction(ctx, "a1");
    expect(detail?.action.id).toBe("a1");
    expect(detail).toMatchObject({ versions: [], runs: [], measurements: [], scanInputs: [] });
    expect(repository.versions).toHaveBeenCalledWith("ws-1", ["a1"]);
    state.actions = [];
    expect(await getAction(ctx, "missing")).toBeNull();
  });

  it("shows the business details the next draft will actually use, sourced from the brand profile and the workspace record (P2.3 item 17)", async () => {
    state.brand = { workspaceId: "ws-1", voice: "professional", approvedClaims: ["Family-run since 1998"], prohibitedTerms: ["cheapest"], languages: ["zh-HK", "en"], facts: {}, updatedAt: "2026-09-01T00:00:00Z" };
    const detail = await getAction(ctx, "a1");
    const byKey = Object.fromEntries((detail?.businessContext ?? []).map((row) => [row.key, row]));
    expect(byKey.workspace.value.en).toBe("Kam Man House");
    expect(byKey.location.value.en).toBe("Yik Yam Street");
    expect(byKey.market.value.en).toContain("Hong Kong");
    expect(byKey.brand_voice.value.en).toBe("professional");
    expect(byKey.approved_claims.value.en).toBe("Family-run since 1998");
    expect(byKey.prohibited_terms.value.en).toBe("cheapest");
    expect(byKey.languages.value.en).toBe("zh-HK, en");
    expect(byKey.snapshot_observed_at).toBeDefined();
    // review-response has no asset requirement, so no asset_rights row at all.
    expect(byKey.asset_rights).toBeUndefined();
  });

  it("shows 'None saved' rather than an empty value for unset brand facts", async () => {
    state.brand = { workspaceId: "ws-1", voice: "warm", approvedClaims: [], prohibitedTerms: [], languages: ["zh-HK"], facts: {}, updatedAt: null };
    const detail = await getAction(ctx, "a1");
    const byKey = Object.fromEntries((detail?.businessContext ?? []).map((row) => [row.key, row]));
    expect(byKey.approved_claims.value.en).toBe("None saved");
    expect(byKey.prohibited_terms.value.en).toBe("None saved");
  });

  it("shows the selected asset's rights status for an asset-requiring template, sourced from the same row socialAssetSatisfied checks", async () => {
    state.actions = [actionRow({ id: "a2", template_key: "social-post", provided_inputs: { asset_id: "asset-1" } })];
    state.asset = { filename: "storefront.jpg", rights_status: "approved" };
    const detail = await getAction(ctx, "a2");
    const assetRow = detail?.businessContext.find((row) => row.key === "asset_rights");
    expect(assetsMock.get).toHaveBeenCalledWith("ws-1", "asset-1");
    expect(assetRow?.value.en).toBe("storefront.jpg · Approved");
  });

  it("says no asset is selected yet rather than silently omitting the row", async () => {
    state.actions = [actionRow({ id: "a2", template_key: "social-post" })];
    const detail = await getAction(ctx, "a2");
    const assetRow = detail?.businessContext.find((row) => row.key === "asset_rights");
    expect(assetRow?.value.en).toBe("No asset selected yet");
  });

  it("reports a text-only post distinctly from a missing asset", async () => {
    state.actions = [actionRow({ id: "a2", template_key: "social-post", provided_inputs: { text_only: true } })];
    const detail = await getAction(ctx, "a2");
    const assetRow = detail?.businessContext.find((row) => row.key === "asset_rights");
    expect(assetRow?.value.en).toBe("Text-only post; no asset attached");
  });

  describe("faqQuestions (P2.3 item 11)", () => {
    it("derives real questions from the referenced snapshot's failing checks and un-cited AEO queries, prefilling from a matching brand fact", async () => {
      state.actions = [actionRow({ id: "a3", template_key: "visibility-content", source_snapshot_id: "snap-9", required_inputs: ["owner_fact_1", "owner_fact_2", "owner_fact_3"] })];
      state.brand = { workspaceId: "ws-1", voice: "warm", approvedClaims: [], prohibitedTerms: [], languages: ["zh-HK"], facts: { opening_hours: "11:00-21:00 daily" }, updatedAt: null };
      artifacts.assistantSnapshot.mockResolvedValueOnce({
        id: "snap-9", jobId: "job-9", workspaceId: "ws-1", locationId: "loc-1",
        websiteChecks: { evaluated: 15, passed: 13, results: [{ key: "opening_hours_text", pass: false }, { key: "https", pass: false }] },
      });
      artifacts.assistantAeoQueries.mockResolvedValueOnce(["best dim sum tin hau"]);
      const detail = await getAction(ctx, "a3");
      expect(artifacts.assistantSnapshot).toHaveBeenCalledWith("ws-1", "snap-9");
      expect(artifacts.assistantAeoQueries).toHaveBeenCalledWith("ws-1", "job-9");
      expect(detail?.faqQuestions).toHaveLength(3);
      expect(detail?.faqQuestions[0].question.en).toContain("best dim sum tin hau");
      expect(detail?.faqQuestions[0].prefill).toBeNull();
      expect(detail?.faqQuestions[1].question.en).toBe("What are your opening hours?");
      expect(detail?.faqQuestions[1].prefill).toBe("11:00-21:00 daily");
      // https is a purely technical check -- never a fact an owner can answer.
      expect(detail?.faqQuestions.some((q) => q.question.en.includes("https"))).toBe(false);
    });

    it("stays empty, with no extra reads at all, for a template that is not the FAQ workflow", async () => {
      const detail = await getAction(ctx, "a1");
      expect(detail?.faqQuestions).toEqual([]);
      expect(artifacts.assistantAeoQueries).not.toHaveBeenCalled();
    });

    it("stays empty when the action has no source snapshot yet", async () => {
      state.actions = [actionRow({ id: "a3", template_key: "visibility-content", source_snapshot_id: null })];
      const detail = await getAction(ctx, "a3");
      expect(detail?.faqQuestions).toEqual([]);
      expect(artifacts.assistantSnapshot).not.toHaveBeenCalled();
    });
  });

  it("reconciles stranded runs once, before anything reads them", async () => {
    const detail = await getAction(ctx, "a1");
    expect(reaper.reapStrandedRuns).toHaveBeenCalledTimes(1);
    expect(reaper.reapStrandedRuns).toHaveBeenCalledWith("ws-1", ["a1"]);
    // The reaped row has to be visible to both run readers: overviewsFor derives
    // runState/displayPhaseKey from repository.runs, and the explicit
    // repository.runs call builds the detail's run history.
    expect(reaper.reapStrandedRuns.mock.invocationCallOrder[0]).toBeLessThan(repository.runs.mock.invocationCallOrder[0]);
    // Reconciliation is best-effort: nothing reaped still returns the full detail.
    expect(detail).toMatchObject({ versions: [], runs: [], measurements: [], scanInputs: [] });
  });

  it("shows the reviews the draft will use instead of asking the owner to retype them", async () => {
    const snapshot: FakeSnapshot = { id: "snap-9", jobId: "job-9", workspaceId: "ws-1", locationId: "loc-1", observedAt: "2026-09-02T00:00:00Z", metrics: { "gbp.reviews_count": 210 } };
    artifacts.assistantSnapshot.mockResolvedValue(snapshot);
    artifacts.assistantReviewData.mockResolvedValue({
      gbp: { reviews: [
        { rating: 2, text: "Slow service", time: "2026-08-30T00:00:00Z" },
        { rating: 5, text: "Answered already", time: "2026-08-29T00:00:00Z", owner_response: "Thanks!" },
      ] },
    });
    state.actions = [actionRow({ id: "a1", template_key: "review-response", source_snapshot_id: "snap-9", required_inputs: ["brand_voice", "reviews_without_response"], action_state: "needs_input" })];

    const detail = await getAction(ctx, "a1");
    // The action's own snapshot, never the location's latest.
    expect(artifacts.assistantSnapshot).toHaveBeenCalledWith("ws-1", "snap-9");
    expect(artifacts.assistantLatestSnapshot).not.toHaveBeenCalled();
    expect(detail?.scanInputs).toHaveLength(1);
    expect(detail?.scanInputs[0]).toMatchObject({
      key: "reviews_without_response",
      factType: "Observed",
      available: 1,
      inspected: 2,
      populationCount: 210,
      jobId: "job-9",
    });
    expect(detail?.scanInputs[0].reviews[0].excerpt).toBe("Slow service");
    // Resolved live, so a row derived before this rule stops reporting an input
    // the workspace can already answer -- while the persisted list is unchanged.
    expect(detail?.action.missingInputs).toEqual(["brand_voice"]);
    expect(detail?.action.requiredInputs).toEqual(["brand_voice", "reviews_without_response"]);
    expect(detail?.action.evidenceInputs).toEqual(["reviews_without_response"]);
    // P2.2 "selected-review replies": with nothing stored the owner has picked
    // nothing yet, so every unanswered review is in play -- and `selected` is
    // resolved through the same filter the run path applies, so the checkboxes
    // cannot promise the agent a review it will not receive.
    expect(detail?.scanInputs[0].reviews[0].key).toEqual(expect.stringMatching(/^[0-9a-f]{8}$/));
    expect(detail?.scanInputs[0].selected).toEqual([detail?.scanInputs[0].reviews[0].key]);
  });

  it("reports only the reviews the owner picked, and falls back when the pick goes stale", async () => {
    const snapshot: FakeSnapshot = { id: "snap-9", jobId: "job-9", workspaceId: "ws-1", locationId: "loc-1", observedAt: "2026-09-02T00:00:00Z", metrics: {} };
    artifacts.assistantSnapshot.mockResolvedValue(snapshot);
    artifacts.assistantReviewData.mockResolvedValue({
      gbp: { reviews: [
        { rating: 2, text: "Slow service", time: "2026-08-30T00:00:00Z" },
        { rating: 1, text: "Cold food", time: "2026-08-28T00:00:00Z" },
      ] },
    });
    const base = { id: "a1", template_key: "review-response", source_snapshot_id: "snap-9", required_inputs: ["reviews_without_response"] } as const;

    state.actions = [actionRow({ ...base })];
    const all = await getAction(ctx, "a1");
    const [first, second] = all!.scanInputs[0].reviews;
    expect(all!.scanInputs[0].selected).toEqual([first.key, second.key]);

    state.actions = [actionRow({ ...base, provided_inputs: { selected_reviews: [second.key] } })];
    expect((await getAction(ctx, "a1"))!.scanInputs[0].selected).toEqual([second.key]);

    // A newer scan replaced the reviews, so the stored pick matches nothing.
    // Falling back to all beats showing an empty selection the agent would not
    // honour anyway.
    state.actions = [actionRow({ ...base, provided_inputs: { selected_reviews: ["deadbeef"] } })];
    expect((await getAction(ctx, "a1"))!.scanInputs[0].selected).toEqual([first.key, second.key]);
  });

  it("reads no review data at all for a template that does not draft replies", async () => {
    state.actions = [actionRow({ id: "a1", template_key: "social-post" })];
    const detail = await getAction(ctx, "a1");
    expect(detail?.scanInputs).toEqual([]);
    expect(artifacts.assistantReviewData).not.toHaveBeenCalled();
  });

  it("keeps the input form when the scan retained no unanswered review", async () => {
    artifacts.assistantSnapshot.mockResolvedValue({ id: "snap-9", jobId: "job-9", workspaceId: "ws-1", locationId: "loc-1", observedAt: "2026-09-02T00:00:00Z", metrics: {} } satisfies FakeSnapshot);
    artifacts.assistantReviewData.mockResolvedValue({ gbp: { reviews: [{ rating: 5, text: "Answered", time: "2026-08-29T00:00:00Z", owner_response: "Thanks!" }] } });
    state.actions = [actionRow({ id: "a1", template_key: "review-response", source_snapshot_id: "snap-9", required_inputs: ["reviews_without_response"], action_state: "needs_input" })];

    const detail = await getAction(ctx, "a1");
    expect(detail?.scanInputs).toEqual([]);
    expect(detail?.action.missingInputs).toEqual(["reviews_without_response"]);
  });

  it("refuses to render another location's review text to an out-of-scope manager", async () => {
    artifacts.assistantSnapshot.mockResolvedValue({ id: "snap-9", jobId: "job-9", workspaceId: "ws-1", locationId: "loc-2", observedAt: "2026-09-02T00:00:00Z", metrics: {} } satisfies FakeSnapshot);
    artifacts.assistantReviewData.mockResolvedValue({ gbp: { reviews: [{ rating: 2, text: "Slow service", time: "2026-08-30T00:00:00Z" }] } });
    state.actions = [actionRow({ id: "a1", template_key: "review-response", location_id: null, source_snapshot_id: "snap-9", required_inputs: ["reviews_without_response"] })];
    const scoped = { ...ctx, membership: { ...ctx.membership, role: "manager" as const, locationScope: ["loc-1"] } };

    const detail = await getAction(scoped, "a1");
    expect(detail?.scanInputs).toEqual([]);
    expect(artifacts.assistantReviewData).not.toHaveBeenCalled();
  });

  it("never reconciles from the actions list", async () => {
    // Deliberate scope decision, not an oversight: reaping in listActions would
    // turn every list render into a multi-row write. The cost is that a stranded
    // run keeps its "Generating" chip until the owner opens that action.
    await listActions(ctx, { location: "all" });
    expect(reaper.reapStrandedRuns).not.toHaveBeenCalled();
  });
});

describe("getNotifications", () => {
  // Review finding: myAddress must be the address the outbox actually sends
  // to (app_users.email, read via mailOutboxRepository().memberSwitches),
  // never ctx.account.email -- that field is workspace_members.email (the
  // invite address), which can differ from the account's real sign-in
  // address and which the outbox never reads.
  it("resolves myAddress from the mail-outbox repository, not from ctx.account.email", async () => {
    mailOutboxMock.memberSwitches.mockResolvedValue({ rescanComplete: true, regressionAlert: false, locale: "en", address: "real-signin@example.test" });
    const invited = { ...ctx, account: { name: "o", email: "invite-address@example.test" } };

    const model = await getNotifications(invited);

    expect(model.myAddress).toBe("real-signin@example.test");
    expect(model.myEmails).toEqual({ rescanComplete: true, regressionAlert: false });
    expect(mailOutboxMock.memberSwitches).toHaveBeenCalledWith("ws-1", "u1");
  });

  it("myAddress is null when the repository has no address on file, even while mail is open", async () => {
    mailOutboxMock.memberSwitches.mockResolvedValue({ rescanComplete: false, regressionAlert: false, locale: null, address: null });
    mailAvailabilityMock.mailAvailability.mockReturnValue({ open: true });

    const model = await getNotifications(ctx);

    expect(model.myAddress).toBeNull();
    expect(model.mailState).toBe("no_address");
  });

  it("defaults myEmails and myAddress honestly when the caller has no switches row", async () => {
    mailOutboxMock.memberSwitches.mockResolvedValue(null);

    const model = await getNotifications(ctx);

    expect(model.myEmails).toEqual({ rescanComplete: false, regressionAlert: false });
    expect(model.myAddress).toBeNull();
    expect(model.role).toBe("owner");
  });
});

/**
 * Final-review fix 2: the settings note is rendered from ONE effective
 * member mail state, computed here, in this order: closed -> paused ->
 * no_address -> not_allowlisted -> none_on -> blocked -> open. Only "open"
 * (at least one kind both allowed by the workspace and switched on by the
 * member) may render "We'll email you at {address}".
 */
describe("getNotifications mailState", () => {
  const ALL_ON = { rescanComplete: true, regressionAlert: true, locale: "en", address: "member@example.test" };
  const GATES = (rescan: boolean, regression: boolean) => ({ notify_rescan_complete: rescan, notify_regression_alert: regression, notify_monthly_digest: true });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is closed when mail is not open, whatever else is true", async () => {
    mailAvailabilityMock.mailAvailability.mockReturnValue({ open: false, reason: "mail_unapproved" });
    vi.stubEnv("MAIL_PAUSED", "true");
    mailOutboxMock.memberSwitches.mockResolvedValue(ALL_ON);
    expect((await getNotifications(ctx)).mailState).toBe("closed");
  });

  it("is paused when mail is open but MAIL_PAUSED is on", async () => {
    vi.stubEnv("MAIL_PAUSED", "true");
    mailOutboxMock.memberSwitches.mockResolvedValue({ ...ALL_ON, address: null });
    expect((await getNotifications(ctx)).mailState).toBe("paused");
  });

  it("is no_address when open and unpaused but no address is on file", async () => {
    mailOutboxMock.memberSwitches.mockResolvedValue({ ...ALL_ON, address: null });
    expect((await getNotifications(ctx)).mailState).toBe("no_address");
  });

  it("is not_allowlisted when the allowlist is set and excludes the address (compared trimmed and lower-cased)", async () => {
    vi.stubEnv("MAIL_RECIPIENT_ALLOWLIST", " Someone@Example.test , ,");
    mailOutboxMock.memberSwitches.mockResolvedValue(ALL_ON);
    expect((await getNotifications(ctx)).mailState).toBe("not_allowlisted");
  });

  it("an allowlisted address in different case is not held back", async () => {
    vi.stubEnv("MAIL_RECIPIENT_ALLOWLIST", " MEMBER@Example.test ,x@y.hk");
    mailOutboxMock.memberSwitches.mockResolvedValue(ALL_ON);
    expect((await getNotifications(ctx)).mailState).toBe("open");
  });

  it("is none_on when the member has neither switch on", async () => {
    mailOutboxMock.memberSwitches.mockResolvedValue({ ...ALL_ON, rescanComplete: false, regressionAlert: false });
    expect((await getNotifications(ctx)).mailState).toBe("none_on");
  });

  it("is blocked when every kind the member turned on is disallowed by the workspace gate", async () => {
    repository.notificationPreferences.mockResolvedValue(GATES(false, true));
    mailOutboxMock.memberSwitches.mockResolvedValue({ ...ALL_ON, regressionAlert: false });
    expect((await getNotifications(ctx)).mailState).toBe("blocked");
  });

  it("is open when at least one kind is both allowed and switched on", async () => {
    repository.notificationPreferences.mockResolvedValue(GATES(false, true));
    mailOutboxMock.memberSwitches.mockResolvedValue(ALL_ON);
    expect((await getNotifications(ctx)).mailState).toBe("open");
  });

  it("is no_address (never open) for a caller with no switches row", async () => {
    mailOutboxMock.memberSwitches.mockResolvedValue(null);
    expect((await getNotifications(ctx)).mailState).toBe("no_address");
  });
});
