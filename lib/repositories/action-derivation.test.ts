import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { actionDerivationRepository } from "./action-derivation";

vi.mock("../db/client", () => ({
  getPool: () => { throw new Error("default_database_forbidden"); },
}));

const findingKey = "gbp.owner_response_low";
const measured = { status: "measured", confidence: "high", score: 70, limitationCode: null };
const unavailable = { status: "unavailable", confidence: "none", score: null, limitationCode: "GBP_UNAVAILABLE" };
type Action = {
  id: string; workspace_id: string; location_id: string | null; template_key: string;
  action_state: string; completed_at: string | null; source_finding_keys: string[];
  source_snapshot_id: string; evidence: Record<string, unknown>;
};

/**
 * An injected SQL boundary, never a DB client. It models the existing partial
 * unique index (only open actions conflict), while the real repository decides
 * whether a recommendation should reach that boundary at all.
 */
function fixture(options: {
  recurrence?: boolean; baselineUnavailable?: boolean; currentUnavailable?: boolean;
  baselineHasFinding?: boolean; completedAt?: string | null; baselineAt?: string;
  completedScope?: { workspace: string; location: string | null }; noCompleted?: boolean;
  currentRawReview?: string; noIntersection?: boolean; noRegression?: boolean; baselineScanStartedAt?: string;
  baselineLimited?: boolean; baselineLegacyConfidence?: boolean; baselineNoScore?: boolean;
} = {}) {
  const scope = options.completedScope ?? { workspace: "ws-1", location: "loc-1" };
  const original: Action = {
    id: "completed-1", workspace_id: scope.workspace, location_id: scope.location,
    template_key: "review-response", action_state: "completed",
    completed_at: options.completedAt === undefined ? "2026-10-15T00:00:00Z" : options.completedAt,
    source_finding_keys: [findingKey], source_snapshot_id: "original-snapshot",
    evidence: { original: true },
  };
  const history: Action[] = options.noCompleted ? [] : [structuredClone(original)];
  const snapshots = new Map<string, Record<string, unknown>>([
    ["head", {
      id: "head", job_id: "head-job", workspace_id: "ws-1", location_id: "loc-1", market: "hk",
      observed_at: "2026-10-18T00:00:00Z", created_at: "2026-10-18T00:00:00Z",
      module_states: { google_business: options.currentUnavailable ? unavailable : measured },
      metrics: {}, coverage: 0.25, overall_score: null, website_checks: null,
      comparable_to: options.recurrence ? "base" : null, diff_id: options.recurrence ? "diff-1" : null,
    }],
    ["base", {
      id: "base", job_id: "base-job", workspace_id: "ws-1", location_id: "loc-1", market: "hk",
      observed_at: options.baselineAt ?? "2026-10-17T00:00:00Z", created_at: "2026-10-17T00:00:00Z",
      module_states: { google_business: options.baselineUnavailable ? unavailable : {
        ...measured,
        limitationCode: options.baselineLimited ? "GBP_PARTIAL_SOURCE" : null,
        confidence: options.baselineLegacyConfidence ? "low" : "high",
        score: options.baselineNoScore ? null : measured.score,
      } },
      metrics: {}, coverage: 0.25, overall_score: null, website_checks: null,
      comparable_to: null, diff_id: null,
    }],
  ]);
  const finding = {
    finding_key: findingKey, module: "gbp", severity: "warning", score_impact: -10,
    owner_message_en: "Some sampled reviews have no reply.", owner_message_zh: "部分抽樣評論未有回覆。",
    evidence: { rate: 20 },
  };
  const diff = {
    id: "diff-1", head_job_id: "head-job", base_job_id: "base-job", comparable: true,
    intersection_modules: options.noIntersection ? [] : ["gbp"],
    regressed_findings: options.noRegression ? [] : [findingKey], resolved_findings: [],
  };
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
    if (sql.includes("FROM scan_snapshots WHERE id=$1")) return { rows: [snapshots.get(String(values[0]))].filter(Boolean) };
    if (sql.includes("FROM audit_jobs WHERE id=$1")) return { rows: [{
      id: values[0], workspace_id: "ws-1", location_id: "loc-1", location_owned: true, status: "done",
      created_at: values[0] === "base-job" ? options.baselineScanStartedAt ?? options.baselineAt ?? "2026-10-17T00:00:00Z" : "2026-10-18T00:00:00Z",
      raw_data: { gbp: { reviews: [{ text: options.currentRawReview ?? "Slow service", rating: 2 }] } },
    }] };
    if (sql.startsWith("SELECT id FROM scan_snapshots")) return { rows: [{ id: "head" }] };
    if (sql.startsWith("SELECT d.*")) return { rows: [diff] };
    if (sql.startsWith("SELECT a.id FROM actions")) return { rows: [] };
    if (sql.startsWith("SELECT finding_key,module")) return { rows: [finding] };
    if (sql.startsWith("SELECT finding_key,evidence")) return { rows: options.baselineHasFinding ? [finding] : [] };
    if (sql.includes("FROM brand_profiles")) return { rows: [{ voice: "warm", languages: ["en"], approved_claims: [] }] };
    if (sql.includes("FROM oauth_connections")) return { rows: [{ status: "active" }] };
    if (sql.startsWith("SELECT industry")) return { rows: [{ industry: null }] };
    if (sql.startsWith("SELECT DISTINCT a.template_key")) return { rows: [] };
    if (sql.includes("FROM actions a") && sql.includes("a.completed_at")) {
      return { rows: history.filter((a) => a.workspace_id === values[0] && a.location_id === values[1])
        .sort((a, b) => Date.parse(b.completed_at ?? "") - Date.parse(a.completed_at ?? "") || 0) };
    }
    if (sql.startsWith("INSERT INTO actions(")) {
      const existing = history.find((a) => a.workspace_id === values[0] && a.location_id === values[1]
        && a.template_key === values[2] && a.action_state !== "completed");
      const evidence = JSON.parse(String(values[8])) as Record<string, unknown>;
      if (existing) {
        existing.evidence = evidence;
        existing.source_snapshot_id = String(values[5]);
        return { rows: [{ created: false }] };
      }
      history.push({
        id: `new-${history.length}`, workspace_id: String(values[0]), location_id: values[1] as string | null,
        template_key: String(values[2]), action_state: String(values[16]), completed_at: null,
        source_finding_keys: values[4] as string[], source_snapshot_id: String(values[5]), evidence,
      });
      return { rows: [{ created: true }] };
    }
    if (sql.startsWith("SELECT id,source_finding_keys")) {
      return { rows: history.filter((a) => a.workspace_id === values[0] && a.location_id === values[1] && a.action_state !== "completed") };
    }
    if (sql.startsWith("INSERT INTO audit_events")) return { rows: [] };
    throw new Error(`unexpected_sql: ${sql}`);
  });
  return { repo: actionDerivationRepository({ query } as unknown as Pick<Pool, "query">), history, original, calls, snapshots };
}

describe("completed action recurrence at the injected repository boundary", () => {
  it("does not create another task when its exact completed source snapshot is derived again", async () => {
    const f = fixture();
    f.history[0].source_snapshot_id = "head";
    f.original.source_snapshot_id = "head";
    expect(await f.repo.derive("head")).toMatchObject({ created: 0, updated: 0 });
    expect(f.history).toEqual([f.original]);
  });

  it("suppresses unchanged newer evidence and changed review text without proof of resolution", async () => {
    const f = fixture({ currentRawReview: "A newly sampled review" });
    await f.repo.derive("head");
    await f.repo.derive("head");
    expect(f.history).toEqual([f.original]);
  });

  it.each([
    { baselineUnavailable: true },
    { baselineLimited: true },
    { baselineLegacyConfidence: true },
    { baselineNoScore: true },
    { currentUnavailable: true },
    { baselineHasFinding: true },
    { completedAt: null },
    { completedAt: "2026-10-17T12:00:00Z" },
    { completedAt: "2026-10-17T00:00:00Z" },
    { baselineScanStartedAt: "2026-10-14T00:00:00Z" },
    { noIntersection: true },
    { noRegression: true },
  ])("requires a complete, comparable, post-completion resolved baseline: %j", async (option) => {
    const f = fixture({ recurrence: true, ...option });
    expect(await f.repo.derive("head")).toMatchObject({ created: 0 });
    expect(f.history).toEqual([f.original]);
  });

  it("creates exactly one linked follow-up after a measured absent baseline, retaining completed history", async () => {
    const f = fixture({ recurrence: true });
    expect(await f.repo.derive("head")).toMatchObject({ created: 1 });
    expect(f.history).toHaveLength(2);
    expect(f.history[0]).toEqual(f.original);
    expect(f.history[1].evidence).toMatchObject({ followUpOfActionId: f.original.id });
    expect(await f.repo.derive("head")).toMatchObject({ created: 0, updated: 1 });
    expect(f.history).toHaveLength(2);
    expect(f.history[1].evidence.followUpOfActionId).toBe(f.original.id);
    // A later ordinary scan updates that same follow-up, retaining the link,
    // even though this latest comparison no longer contains a new regression.
    Object.assign(f.snapshots.get("head")!, {
      observed_at: "2026-10-19T00:00:00Z", comparable_to: null, diff_id: null,
    });
    expect(await f.repo.derive("head")).toMatchObject({ created: 0, updated: 1 });
    expect(f.history).toHaveLength(2);
    expect(f.history[1].evidence.followUpOfActionId).toBe(f.original.id);
  });

  it("does not reuse the original recurrence proof after its follow-up was completed", async () => {
    const f = fixture({ recurrence: true });
    await f.repo.derive("head");
    f.history[1].action_state = "completed";
    f.history[1].completed_at = "2026-10-18T01:00:00Z";
    expect(await f.repo.derive("head")).toMatchObject({ created: 0, updated: 0 });
    expect(f.history).toHaveLength(2);
  });

  it.each([
    { workspace: "ws-other", location: "loc-1" },
    { workspace: "ws-1", location: "loc-other" },
    { workspace: "ws-1", location: null },
  ])("does not use a completed action from another exact scope: %j", async (completedScope) => {
    const f = fixture({ completedScope });
    expect(await f.repo.derive("head")).toMatchObject({ created: 1 });
    expect(f.history.at(-1)?.evidence.followUpOfActionId).toBeUndefined();
    const historyRead = f.calls.find((call) => call.sql.includes("a.completed_at"));
    expect(historyRead?.values.slice(0, 2)).toEqual(["ws-1", "loc-1"]);
    expect(historyRead?.sql).toContain("a.workspace_id=$1 AND a.location_id IS NOT DISTINCT FROM $2::uuid");
    expect(historyRead?.sql).toContain("FOR UPDATE OF a");
  });

  it("preserves first-time derivation and never accesses content, applications or usage tables", async () => {
    const f = fixture({ noCompleted: true });
    expect(await f.repo.derive("head")).toMatchObject({ created: 1 });
    expect(f.calls.filter(({ sql }) => /^\s*(UPDATE|INSERT|DELETE)[\s\S]*?(output_versions|action_applications|workspace_usage)/i.test(sql))).toEqual([]);
  });
});
