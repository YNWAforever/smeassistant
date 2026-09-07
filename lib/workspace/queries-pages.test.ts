import { beforeEach, describe, expect, it, vi } from "vitest";
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
}));

vi.mock("server-only", () => ({}));
const evidenceMock = vi.hoisted(() => ({ loadAuthorizedEvidence: vi.fn(async () => ({ items: [] as unknown[] })) }));
vi.mock("@/lib/evidence/load-authorized", () => ({ loadAuthorizedEvidence: evidenceMock.loadAuthorizedEvidence }));
const repository = vi.hoisted(() => ({
  snapshots: vi.fn(), diff: vi.fn(), actions: vi.fn(), runs: vi.fn(), versions: vi.fn(),
  latestConnection: vi.fn(), measurements: vi.fn(), draftVersions: vi.fn(),
  completedActions: vi.fn(), schedules: vi.fn(), aeoSnapshots: vi.fn(),
  activity: vi.fn(), notifications: vi.fn(), notificationPreferences: vi.fn(),
}));
vi.mock("@/lib/repositories/workspace-read", () => ({ workspaceReadRepository: () => repository }));

import { getHomeBrief, getInsights, listActions, getActivity, getIntegrations, getAction, loadActionRows, loadDiffById } from "./queries-pages";

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
  repository.actions.mockImplementation(async () => state.actions);
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

  state.snapshots = [snapshotRow({})];
  state.diffs = {}; state.actions = [actionRow({}), actionRow({ id: "a2", template_key: "social-post", priority: "high", priority_score: 45, action_state: "recommended", required_inputs: [] })];
  state.measurements = []; state.versions = []; state.completed = []; state.schedule = { next_run_at: "2026-09-14T00:00:00Z" }; state.connections = [{ status: "active" }]; state.runs = [];
});

describe("getHomeBrief", () => {
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
    expect(brief.nextScanAt).toBe("2026-09-14T00:00:00Z");
    expect(brief.priority?.id).toBe("a1");
    state.diffs.d1 = { ...state.diffs.d1, comparable: true, incomparable_reason: null, resolved_findings: ["gbp.rating_low"], regressed_findings: ["gbp.owner_response_low"] };
    const comparable = await getHomeBrief(ctx, "yik-yam");
    expect(comparable.changed).toMatchObject({ factType: "Observed", delta: -4, comparable: true });
    expect(comparable.month.resolved).toBe(1);
    expect(comparable.month.regressed).toBe(1);
  });
});

describe("listActions", () => {
  it("counts the tabs and applies view and channel filters", async () => {
    const all = await listActions(ctx, { location: "all" });
    expect(all.counts).toMatchObject({ all: 2, needs_input: 1, completed: 0 });
    const needsInput = await listActions(ctx, { location: "all", view: "needs_input" });
    expect(needsInput.actions.map((a) => a.id)).toEqual(["a1"]);
    const instagram = await listActions(ctx, { location: "all", channel: "instagram" });
    expect(instagram.actions.map((a) => a.id)).toEqual(["a2"]);
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
    expect(detail).toMatchObject({ versions: [], runs: [], measurements: [] });
    expect(repository.versions).toHaveBeenCalledWith("ws-1", ["a1"]);
    state.actions = [];
    expect(await getAction(ctx, "missing")).toBeNull();
  });
});
