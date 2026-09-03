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
vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const terminal = () => {
        if (table === "scan_snapshots") return { data: state.snapshots.filter((s) => s.location_id === filters.location_id), error: null };
        if (table === "scan_diffs") return { data: state.diffs[String(filters.id)] ?? null, error: null };
        if (table === "actions") return { data: filters.action_state === "completed" ? state.completed : state.actions, error: null };
        if (table === "action_measurements") return { data: state.measurements, error: null };
        if (table === "output_versions") return { data: state.versions, error: null };
        if (table === "action_runs") return { data: state.runs, error: null };
        if (table === "scan_schedules") return { data: state.schedule, error: null };
        if (table === "oauth_connections") return { data: state.connections, error: null };
        if (table === "aeo_surface_snapshots") return { data: [], error: null };
        return { data: null, error: null };
      };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self, order: self, limit: self, or: self, in: self, gte: self,
        eq: (c: string, v: unknown) => { filters[c] = v; return chain; },
        returns: () => Promise.resolve(terminal()),
        maybeSingle: () => Promise.resolve(terminal()),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(terminal()).then(res, rej),
      });
      return chain;
    },
  }),
}));

import { getHomeBrief, getInsights, listActions } from "./queries-pages";

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
  });

  it("reads the change from scan_diffs and reports incomparable reasons", async () => {
    state.snapshots = [snapshotRow({ diff_id: "d1" })];
    state.diffs.d1 = { id: "d1", comparable: false, incomparable_reason: "SCORING_VERSION_MISMATCH", composite_withheld_reason: null, composite_base: 66, composite_head: 62, composite_delta: -4, resolved_findings: [], regressed_findings: [], decayed_findings: [] };
    const brief = await getHomeBrief(ctx, "yik-yam");
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
