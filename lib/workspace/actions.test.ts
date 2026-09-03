import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { closeResolvedActions, deriveActions, deriveActionsForSnapshot, rankActions, upsertOpenActions, type FindingRow } from "./actions";
import type { ScanDiffRow, SnapshotRecord } from "./snapshots";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  snapshot: null as Row | null,
  findings: [] as Row[],
  diffs: [] as Row[],
  actions: [] as Row[],
  brand: null as Row | null,
  google: [] as Row[],
  versions: [] as Row[],
  audits: [] as Row[],
  inserts: [] as Row[],
}));

function client(): SupabaseClient {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let ins: Row | null = null;
    let patch: Row | null = null;
    const terminal = () => {
      const f = (col: string) => filters.find(([c]) => c === col)?.[1];
      if (table === "scan_snapshots") return { data: state.snapshot, error: null };
      if (table === "audit_findings") return { data: state.findings, error: null };
      if (table === "scan_diffs") return { data: state.diffs, error: null };
      if (table === "brand_profiles") return { data: state.brand, error: null };
      if (table === "oauth_connections") return { data: state.google, error: null };
      if (table === "workspaces") return { data: { industry: "fnb" }, error: null };
      if (table === "output_versions") return { data: state.versions, error: null };
      if (table === "audit_events") {
        if (ins) state.audits.push(ins);
        return { data: state.audits.filter((a) => a.entity_id === f("entity_id")), error: null };
      }
      if (table === "actions") {
        if (ins) {
          const row = { id: `act-${state.actions.length + 1}`, ...ins };
          state.actions.push(row);
          state.inserts.push(row);
          return { data: row, error: null };
        }
        if (patch) {
          const target = state.actions.find((a) => a.id === f("id"));
          if (target) Object.assign(target, patch);
          return { data: null, error: null };
        }
        let rows = state.actions.filter((a) => a.workspace_id === f("workspace_id"));
        const keys = f("dedupe_key:in") as string[] | undefined;
        if (keys) rows = rows.filter((a) => keys.includes(String(a.dedupe_key)));
        const states = f("action_state:in") as string[] | undefined;
        if (states) rows = rows.filter((a) => states.includes(String(a.action_state)));
        if (filters.some(([c]) => c === "source")) rows = rows.filter((a) => a.source === f("source"));
        if (filters.some(([c]) => c === "location_id")) rows = rows.filter((a) => a.location_id === f("location_id"));
        if (filters.some(([c]) => c === "location_id:is")) rows = rows.filter((a) => a.location_id === null);
        return { data: rows, error: null };
      }
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      order: self,
      limit: self,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
      in: (c: string, v: unknown) => { filters.push([`${c}:in`, v]); return chain; },
      is: (c: string, v: unknown) => { filters.push([`${c}:is`, v]); return chain; },
      insert: (r: Row) => { ins = r; return Promise.resolve(terminal()); },
      update: (r: Row) => { patch = r; return chain; },
      returns: () => Promise.resolve(terminal()),
      maybeSingle: () => Promise.resolve(terminal()),
      single: () => Promise.resolve(terminal()),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(terminal()).then(res, rej),
    });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const snapshot: SnapshotRecord = {
  id: "snap-1", jobId: "job-1", workspaceId: "ws-1", locationId: "loc-1", market: "hk", observedAt: "2026-09-01T00:00:00Z", scoringVersion: "2026-08-16",
  overallScore: 62, coverage: 0.78,
  moduleStates: {
    google_business: { status: "measured", confidence: "high", limitationCode: null, score: 71 },
    instagram: { status: "unavailable", confidence: "none", limitationCode: "IG_HANDLE_NOT_PROVIDED", score: null },
    search_ai: { status: "measured", confidence: "medium", limitationCode: null, score: 40 },
    website: { status: "measured", confidence: "high", limitationCode: null, score: null },
  },
  metrics: {}, websiteChecks: { evaluated: 15, passed: 9, results: [{ key: "faq_schema", pass: false }] }, comparableTo: null, diffId: null, createdAt: "2026-09-01T00:00:00Z",
};

const findings: FindingRow[] = [
  { finding_key: "gbp.owner_response_low", module: "gbp", severity: "critical", score_impact: -15, owner_message_zh: "zh1", owner_message_en: "Low response rate", evidence: { rate: 18 } },
  { finding_key: "gbp.rating_low", module: "gbp", severity: "warning", score_impact: -6, owner_message_zh: "zh2", owner_message_en: "Rating low", evidence: { rating: 3.9 } },
  { finding_key: "trust.review_volume", module: "trust", severity: "info", score_impact: 0, owner_message_zh: "zh3", owner_message_en: "Good volume", evidence: {} },
  { finding_key: "trust.cross_signal", module: "trust", severity: "warning", score_impact: -4, owner_message_zh: "x", owner_message_en: "x", evidence: {} },
  { finding_key: "ig.content_consistency", module: "ig", severity: "warning", score_impact: -8, owner_message_zh: "zh4", owner_message_en: "Gap", evidence: { days: 16 } },
];

const baseInput = { snapshot, findings, latestDiff: null, brandProfileExists: true, googleConnection: { status: "active" }, industry: "fnb", existingDrafts: new Set<never>(), now: new Date("2026-09-03T00:00:00Z") };

const diffRow = (over: Partial<ScanDiffRow>): ScanDiffRow => ({
  id: "d", base_job_id: "b", head_job_id: "job-1", comparable: true, incomparable_reason: null, composite_withheld_reason: null, intersection_modules: ["gbp"],
  composite_base: 66, composite_head: 62, composite_delta: -4, resolved_findings: [], regressed_findings: [], decayed_findings: [], lost_coverage: [], gained_coverage: [],
  created_at: "2026-09-01T00:00:00Z", ...over,
});

beforeEach(() => {
  state.snapshot = { id: "snap-1", job_id: "job-1", workspace_id: "ws-1", location_id: "loc-1", market: "hk", observed_at: snapshot.observedAt, scoring_version: "2026-08-16", overall_score: 62, coverage: 0.78, module_states: snapshot.moduleStates, metrics: {}, website_checks: snapshot.websiteChecks, comparable_to: null, diff_id: null, created_at: snapshot.createdAt };
  state.findings = findings as unknown as Row[];
  state.diffs = []; state.actions = []; state.brand = { workspace_id: "ws-1" }; state.google = [{ status: "active" }]; state.versions = []; state.audits = []; state.inserts = [];
});

describe("deriveActions", () => {
  it("groups negative-impact findings per template, ignores zero-impact and ledger keys, adds the website FAQ trigger", () => {
    const derived = deriveActions(baseInput);
    const keys = derived.map((a) => a.templateKey);
    expect(keys).toContain("review-response");
    expect(keys).toContain("social-post");
    expect(keys).toContain("visibility-content");
    expect(keys).not.toContain("google-reconnect");
    const review = derived.find((a) => a.templateKey === "review-response")!;
    expect(review.sourceFindingKeys).toEqual(["gbp.owner_response_low", "gbp.rating_low"]);
    expect(review.evidence.value).toBe("18");
    expect(review.evidence.freshness.en).toBe("Updated 2 days ago");
    expect(review.dedupeKey).toBe("ws-1:loc-1:review-response");
    expect(derived.some((a) => a.sourceFindingKeys.includes("trust.review_volume") || a.sourceFindingKeys.includes("trust.cross_signal"))).toBe(false);
    expect(derived.find((a) => a.templateKey === "visibility-content")!.sourceFindingKeys).toEqual(["website.checks.faq_schema"]);
  });

  it("adds google-reconnect when the connection is missing or expired and ranks deterministically", () => {
    expect(deriveActions({ ...baseInput, googleConnection: null }).map((a) => a.templateKey)).toContain("google-reconnect");
    const expired = deriveActions({ ...baseInput, googleConnection: { status: "expired" } });
    expect(expired.find((a) => a.templateKey === "google-reconnect")!.capability).toBe("Requires connection");
    const a = deriveActions(baseInput).map((x) => [x.templateKey, x.priorityScore]);
    const b = deriveActions(baseInput).map((x) => [x.templateKey, x.priorityScore]);
    expect(a).toEqual(b);
    const ranked = rankActions(deriveActions(baseInput));
    for (let i = 1; i < ranked.length; i += 1) expect(ranked[i - 1].priorityScore).toBeGreaterThanOrEqual(ranked[i].priorityScore);
  });

  it("marks regressed findings urgent via the comparable diff", () => {
    const withDiff = deriveActions({ ...baseInput, latestDiff: diffRow({ regressed_findings: ["gbp.owner_response_low"] }) }).find((a) => a.templateKey === "review-response")!;
    expect(withDiff.priorityFactors.find((f) => f.key === "urgency")!.points).toBe(15);
  });
});

describe("upsertOpenActions / closeResolvedActions", () => {
  it("dedupes on a second run: updates instead of inserting", async () => {
    const db = client();
    const derived = deriveActions(baseInput);
    expect(await upsertOpenActions(db, "ws-1", derived, { snapshotId: "snap-1" })).toEqual({ created: derived.length, updated: 0 });
    expect(await upsertOpenActions(db, "ws-1", derived, { snapshotId: "snap-2" })).toEqual({ created: 0, updated: derived.length });
    expect(state.actions).toHaveLength(derived.length);
    expect(state.inserts[0]).toMatchObject({ action_state: "needs_input", dedupe_key: "ws-1:loc-1:review-response" });
  });

  it("completes resolved actions from a comparable diff and expires vanished ones", async () => {
    const db = client();
    await upsertOpenActions(db, "ws-1", deriveActions(baseInput), { snapshotId: "snap-1" });
    const diff = diffRow({ base_job_id: "job-1", head_job_id: "job-2", resolved_findings: ["gbp.owner_response_low", "gbp.rating_low"], intersection_modules: ["gbp", "ig"] });
    expect(await closeResolvedActions(db, "ws-1", "loc-1", diff, new Set(["website.checks.faq_schema"]))).toEqual({ completed: 1, expired: 1 });
    expect(state.actions.find((a) => a.template_key === "review-response")).toMatchObject({ action_state: "completed", measurement_state: "measured" });
    expect(state.actions.find((a) => a.template_key === "social-post")!.action_state).toBe("expired");
    expect(state.actions.find((a) => a.template_key === "visibility-content")!.action_state).toBe("needs_input");
  });

  it("runs the full pipeline once per snapshot with a single audit event", async () => {
    const db = client();
    const result = await deriveActionsForSnapshot(db, "snap-1", { now: new Date("2026-09-03T00:00:00Z") });
    expect(result.created).toBeGreaterThan(0);
    await deriveActionsForSnapshot(db, "snap-1", { now: new Date("2026-09-03T00:00:00Z") });
    expect(state.audits.filter((a) => a.event === "action.derived")).toHaveLength(1);
    expect(state.actions).toHaveLength(result.created);
  });
});
