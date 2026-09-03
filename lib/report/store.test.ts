import { describe, expect, it, vi } from "vitest";
import type { supabaseServer } from "@/lib/supabase/admin";

vi.mock("server-only", () => ({}));

import { createReportStore } from "./store";

type QueryResult = { data: unknown; error: unknown; count?: number | null };
type Spy = (...args: unknown[]) => unknown;

function chainableQuery(result: QueryResult, spies?: {
  select?: Spy;
  eq?: Spy;
  order?: Spy;
  limit?: Spy;
  single?: Spy;
  update?: Spy;
  is?: Spy;
}) {
  const query: Record<string, unknown> = {};
  const chain = (spy?: Spy) =>
    vi.fn((...args: unknown[]) => {
      spy?.(...args);
      return query;
    });
  Object.assign(query, {
    select: chain(spies?.select),
    eq: chain(spies?.eq),
    order: chain(spies?.order),
    limit: chain(spies?.limit),
    update: chain(spies?.update),
    is: chain(spies?.is),
    single: spies?.single
      ? vi.fn(async (...args: unknown[]) => {
          spies.single?.(...args);
          return result;
        })
      : vi.fn(async () => result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  });
  return query as {
    select: Spy;
    eq: Spy;
    order: Spy;
    limit: Spy;
    update: Spy;
    is: Spy;
    single: Spy;
    then: (resolve: (value: QueryResult) => unknown) => Promise<unknown>;
  };
}

describe("createReportStore", () => {
  it("reads capped public findings and an exact count separately", async () => {
    const publicFindingsSelect = vi.fn();
    const publicFindingsOrder = vi.fn();
    const publicFindingsLimit = vi.fn();
    const publicCountSelect = vi.fn();

    const publicFindingsQuery = chainableQuery(
      {
        data: [{ id: "finding-1", job_id: "job-1", module: "ig", finding_key: "ig.profile", severity: "high", score_impact: -10 }],
        error: null,
      },
      { select: publicFindingsSelect, order: publicFindingsOrder, limit: publicFindingsLimit },
    );
    const publicCountQuery = chainableQuery(
      { data: null, error: null, count: 34 },
      { select: publicCountSelect },
    );

    const from = vi.fn((table: string) => {
        if (table !== "audit_findings") throw new Error(`unexpected table ${table}`);
        return from.mock.calls.length === 1 ? publicFindingsQuery : publicCountQuery;
      });
    const fakeSupabase = { from } as unknown as ReturnType<typeof supabaseServer>;

    const store = createReportStore(fakeSupabase);
    await store.readPublicFindings("job-1");

    expect(publicFindingsSelect).toHaveBeenCalledWith(
      "id, job_id, module, finding_key, severity, score_impact",
    );
    expect(publicFindingsOrder).toHaveBeenCalledWith("score_impact", { ascending: true });
    expect(publicFindingsLimit).toHaveBeenCalledWith(12);
    expect(publicCountSelect).toHaveBeenCalledWith("id", { count: "exact", head: true });
  });

  it("does not use authorized columns from the public job read", async () => {
    const publicJobSelect = vi.fn();
    const publicJobQuery = chainableQuery(
      {
        data: {
          id: "job-1",
          share_slug: "slug-1",
          business_name: "Example Shop",
          district: "Central",
          industry: "Cafe",
          status: "done",
          overall_score: 72,
          module_scores: null,
          module_results: null,
          score_coverage: 0.9,
          region: "hk",
          scoring_version: "2026-08-02",
        },
        error: null,
      },
      { select: publicJobSelect },
    );

    const from = vi.fn((table: string) => {
        if (table !== "audit_jobs") throw new Error(`unexpected table ${table}`);
        return publicJobQuery;
      });
    const fakeSupabase = { from } as unknown as ReturnType<typeof supabaseServer>;

    const store = createReportStore(fakeSupabase);
    await store.readPublicJobBySlug("slug-1");

    expect(publicJobSelect).toHaveBeenCalledWith(
      "id, share_slug, business_name, district, industry, status, overall_score, module_scores, module_results, score_coverage, region, scoring_version, workspace_id",
    );
    expect(publicJobSelect.mock.calls[0][0]).not.toContain("raw_data");
  });

  it("returns null for a missing public job slug", async () => {
    const publicJobQuery = chainableQuery(
      { data: null, error: { code: "PGRST116", message: "no rows" } },
      { select: vi.fn() },
    );
    const fakeSupabase = {
      from: vi.fn(() => publicJobQuery),
    } as unknown as ReturnType<typeof supabaseServer>;

    const store = createReportStore(fakeSupabase);

    await expect(store.readPublicJobBySlug("missing")).resolves.toBeNull();
  });

  it("loads authorized job data with the detail-only projection", async () => {
    const authorizedJobSelect = vi.fn();
    const authorizedJobQuery = chainableQuery(
      {
        data: { raw_data: { proof: true }, summary_zh: "zh", summary_en: "en", summary_tw: "tw" },
        error: null,
      },
      { select: authorizedJobSelect },
    );
    const fakeSupabase = {
      from: vi.fn(() => authorizedJobQuery),
    } as unknown as ReturnType<typeof supabaseServer>;

    const store = createReportStore(fakeSupabase);
    const data = await store.readAuthorizedJobData("job-1");

    expect(authorizedJobSelect).toHaveBeenCalledWith("raw_data, summary_zh, summary_en, summary_tw");
    expect(data).toEqual({ raw_data: { proof: true }, summary_zh: "zh", summary_en: "en", summary_tw: "tw" });
  });

  it("loads authorized findings with localized detail and evidence fields", async () => {
    const authorizedFindingsSelect = vi.fn();
    const authorizedFindingsOrder = vi.fn();
    const authorizedFindingsQuery = chainableQuery(
      {
        data: [{
          id: "finding-1",
          job_id: "job-1",
          module: "ig",
          finding_key: "ig.profile",
          severity: "high",
          score_impact: -10,
          owner_message_zh: "zh",
          owner_message_en: "en",
          owner_message_tw: "tw",
          owner_action_zh: "act-zh",
          owner_action_en: "act-en",
          evidence: { proof: true },
        }],
        error: null,
      },
      { select: authorizedFindingsSelect, order: authorizedFindingsOrder },
    );
    const fakeSupabase = {
      from: vi.fn(() => authorizedFindingsQuery),
    } as unknown as ReturnType<typeof supabaseServer>;

    const store = createReportStore(fakeSupabase);
    const findings = await store.readAuthorizedFindings("job-1");

    expect(authorizedFindingsSelect).toHaveBeenCalledWith(
      "id, job_id, module, finding_key, severity, score_impact, owner_message_zh, owner_message_en, owner_message_tw, owner_action_zh, owner_action_en, evidence, v02_agent_hint",
    );
    expect(authorizedFindingsOrder).toHaveBeenCalledWith("score_impact", { ascending: true });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toEqual({ proof: true });
  });

  it("reads only approved agent_runs rows for a job", async () => {
    const agentRunsSelect = vi.fn();
    const agentRunsEq = vi.fn();
    const agentRunsQuery = chainableQuery(
      {
        data: [{ finding_key: "gbp.owner_response_low", agent_key: "review_reply_agent", output: { agentKey: "review_reply_agent", draftReply: "x" } }],
        error: null,
      },
      { select: agentRunsSelect, eq: agentRunsEq },
    );
    const fakeSupabase = {
      from: vi.fn(() => agentRunsQuery),
    } as unknown as ReturnType<typeof supabaseServer>;

    const store = createReportStore(fakeSupabase);
    const runs = await store.readApprovedAgentRuns("job-1");

    expect(agentRunsSelect).toHaveBeenCalledWith("finding_key, agent_key, output");
    expect(agentRunsEq).toHaveBeenCalledWith("job_id", "job-1");
    expect(agentRunsEq).toHaveBeenCalledWith("status", "approved");
    expect(runs).toEqual([{ findingKey: "gbp.owner_response_low", agentKey: "review_reply_agent", output: { agentKey: "review_reply_agent", draftReply: "x" } }]);
  });

  it("returns null for a missing viewer grant", async () => {
    const grantSelect = vi.fn();
    const grantQuery = chainableQuery(
      { data: null, error: { code: "PGRST116", message: "no rows" } },
      { select: grantSelect },
    );
    const fakeSupabase = {
      from: vi.fn(() => grantQuery),
    } as unknown as ReturnType<typeof supabaseServer>;

    const store = createReportStore(fakeSupabase);

    await expect(store.findViewerGrant("job-1", "grant-1")).resolves.toBeNull();
    expect(grantSelect).toHaveBeenCalledWith(
      "id, job_id, token_hash, expires_at, redeemed_at, revoked_at, last_used_at",
    );
  });

  it("normalizes database errors from public findings reads", async () => {
    const publicFindingsQuery = chainableQuery(
      { data: null, error: { message: "database offline" } },
      { select: vi.fn(), limit: vi.fn() },
    );
    const publicCountQuery = chainableQuery({ data: null, error: null, count: 0 }, { select: vi.fn() });
    const from = vi.fn(() => (from.mock.calls.length === 1 ? publicFindingsQuery : publicCountQuery));
    const fakeSupabase = { from } as unknown as ReturnType<typeof supabaseServer>;

    const store = createReportStore(fakeSupabase);

    await expect(store.readPublicFindings("job-1")).rejects.toThrow(
      "Unable to load public report findings: database offline",
    );
  });

  it("writes grant usage timestamps without widening the update scope", async () => {
    const updateSpy = vi.fn();
    const eqSpy = vi.fn();
    const isSpy = vi.fn();
    const markUsedQuery = chainableQuery(
      { data: null, error: null },
      { update: updateSpy, eq: eqSpy, is: isSpy },
    );
    const fakeSupabase = {
      from: vi.fn(() => markUsedQuery),
    } as unknown as ReturnType<typeof supabaseServer>;

    const store = createReportStore(fakeSupabase);
    await store.markViewerGrantUsed("job-1", "grant-1");

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(eqSpy).toHaveBeenNthCalledWith(1, "id", "grant-1");
    expect(eqSpy).toHaveBeenNthCalledWith(2, "job_id", "job-1");
    expect(isSpy).toHaveBeenCalledWith("revoked_at", null);
  });

  it("updates the requested cached summary column only", async () => {
    const updateSpy = vi.fn();
    const eqSpy = vi.fn();
    const cacheQuery = chainableQuery(
      { data: null, error: null },
      { update: updateSpy, eq: eqSpy },
    );
    const fakeSupabase = {
      from: vi.fn(() => cacheQuery),
    } as unknown as ReturnType<typeof supabaseServer>;

    const store = createReportStore(fakeSupabase);
    await store.cacheSummary("job-1", "summary_en", "cached summary");

    expect(updateSpy).toHaveBeenCalledWith({ summary_en: "cached summary" });
    expect(eqSpy).toHaveBeenCalledWith("id", "job-1");
  });
});
