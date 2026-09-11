import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMResult } from "@/lib/llm";
import type {
  ArtifactRepository,
  ActionRunRepository,
  FinishActionRunInput,
} from "@/lib/repositories/artifacts";
import type { Membership } from "@/lib/auth";
import { rowToSnapshot } from "./snapshots";
import { AGENT_RUN_BUDGET_MS, runAgentForAction, snapshotEvidence } from "./runs";
const action = {
  id: "act-1",
  workspace_id: "ws-1",
  location_id: "loc-1",
  template_key: "review-response",
  source: "finding",
  source_finding_keys: ["gbp.owner_response_low"],
  source_snapshot_id: null,
  title: { en: "Reply", "zh-HK": "回覆", "zh-TW": "回覆" },
  summary: { en: "", "zh-HK": "", "zh-TW": "" },
  evidence: {},
  priority: "high",
  priority_score: 70,
  priority_factors: [],
  effort_minutes: 10,
  required_inputs: ["brand_voice"],
  provided_inputs: { brand_voice: "warm" },
  assignee_user_id: null,
  due_at: null,
  action_state: "recommended",
  measurement_state: "not_eligible",
  capability: "Live",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const snapshotRow = {
  id: "snap-1",
  job_id: "job-1",
  workspace_id: "ws-1",
  location_id: "loc-1",
  market: "hk",
  observed_at: "2026-09-01T10:00:00Z",
  scoring_version: "v",
  overall_score: 62,
  coverage: 0.8,
  module_states: {},
  metrics: { "gbp.response_rate_pct": 18 },
  website_checks: null,
  comparable_to: null,
  diff_id: null,
  created_at: "2026-09-01T10:00:00Z",
};

const good = (over: Partial<Record<string, unknown>> = {}): LLMResult => ({
  text: JSON.stringify({
    title: "Replies",
    body: "1. Thank you — we will speed up service. Please come back.",
    acceptance_criteria: ["check names"],
    warnings: [],
    facts_used: ["voice"],
    facts_needed: [],
    ...over,
  }),
  usage: { inputTokens: 100, outputTokens: 50 },
});

const membership: Membership = {
  workspaceId: "ws-1",
  workspaceSlug: "fixture",
  userId: "user-1",
  email: "f@example.test",
  role: "owner",
  locationScope: null,
};
let row = { ...action };
const queue = vi.fn(async () => "run-1"),
  start = vi.fn(async () => {}),
  asset = vi.fn(async () => null);
const finish = vi.fn(async (i: FinishActionRunInput) =>
  i.error
    ? { runId: i.runId, state: "failed" as const, error: i.error }
    : i.factsNeeded?.length || i.output?.facts_needed.length
      ? {
          runId: i.runId,
          state: "succeeded" as const,
          factsNeeded: i.output?.facts_needed.length
            ? i.output.facts_needed
            : i.factsNeeded,
        }
      : {
          runId: i.runId,
          state: "succeeded" as const,
          versionId: "v-1",
          versionNo: 1,
        },
);
const persistence: ActionRunRepository = { queue, start, finish };
function repository() {
  return {
    actionScope: async () => ({
      actionId: row.id,
      workspaceId: row.workspace_id,
      locationId: row.location_id,
    }),
    assistantActions: async () => [row],
    assistantSnapshot: async () => null,
    assistantLatestSnapshot: async () =>
      rowToSnapshot(snapshotRow as Parameters<typeof rowToSnapshot>[0]),
    assistantWorkspace: async () => ({
      business_name: "Kam Man House",
      market: "hk",
      timezone: "Asia/Hong_Kong",
    }),
    assistantLocations: async () => [
      {
        id: "loc-1",
        slug: "yik-yam",
        name: "Yik Yam",
        address: null,
        district: "Yau Ma Tei",
      },
    ],
    assistantBrand: async () => ({
      voice: "warm",
      approved_claims: [],
      prohibited_terms: ["best in Hong Kong"],
      languages: [],
      facts: {},
    }),
    assistantReviewData: async () => ({
      gbp: {
        reviews: [
          {
            rating: 2,
            text: "Slow service",
            time: "2026-08-30",
            owner_response: null,
          },
          {
            rating: 5,
            text: "Great",
            time: "2026-08-31",
            owner_response: "Thanks",
          },
        ],
      },
    }),
  } as unknown as ArtifactRepository;
}
const run = (over: Record<string, unknown> = {}) =>
  runAgentForAction(repository(), {
    actionId: "act-1",
    actorId: "user-1",
    locale: "en",
    membership,
    persistence,
    assets: { get: asset },
    ...over,
  });
beforeEach(() => {
  row = { ...action };
  vi.clearAllMocks();
});
describe("typed action runtime", () => {
  it("uses review excerpts and persists token cost", async () => {
    const llm = vi.fn(async (p: string) => {
      expect(p).toContain("Slow service");
      expect(p).not.toContain("Great");
      return good();
    });
    expect(await run({ llm })).toMatchObject({ versionId: "v-1" });
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { inputTokens: 100, outputTokens: 50 },
        costUsd: 0.00006,
      }),
    );
    expect(start).toHaveBeenCalledOnce();
  });
  it("never lets owner-typed text become collected evidence", async () => {
    const typed = "I typed this myself";
    const llm = vi.fn(async (p: string) => {
      const evidenceStart = p.indexOf('"sampled_reviews_without_owner_response"');
      const providedStart = p.indexOf('"provided_inputs"');
      // The scanned sample is built from stored raw_data only; the owner's text
      // appears solely under provided_inputs, which the prompt calls a fallback.
      expect(p.slice(evidenceStart, providedStart)).toContain("Slow service");
      expect(p.slice(evidenceStart, providedStart)).not.toContain(typed);
      expect(p).toContain(typed);
      return good();
    });
    await run({ llm, inputs: { reviews_without_response: typed } });
    expect(llm).toHaveBeenCalledOnce();
  });
  it("sums both attempts", async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce({
        text: "bad",
        usage: { inputTokens: 10, outputTokens: 2 },
      })
      .mockResolvedValueOnce(good());
    await run({ llm });
    expect(llm).toHaveBeenCalledTimes(2);
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { inputTokens: 110, outputTokens: 52 },
      }),
    );
  });
  it("fails invalid output without a version", async () => {
    expect(await run({ llm: vi.fn(async () => null) })).toMatchObject({
      state: "failed",
    });
    expect(finish.mock.calls[0][0].output).toBeNull();
  });
  it("blocks nonempty facts-needed even with body and merges inputs", async () => {
    expect(
      await run({
        llm: vi.fn(async () => good({ facts_needed: ["language"] })),
        inputs: { language: "" },
      }),
    ).toMatchObject({ factsNeeded: ["language"] });
    expect(queue).toHaveBeenCalledWith(
      expect.objectContaining({
        providedInputs: { brand_voice: "warm", language: "" },
      }),
    );
  });
  it("retains acceptance warnings", async () => {
    await run({
      llm: vi.fn(async () =>
        good({ body: "We are the best in Hong Kong, refund guaranteed." }),
      ),
    });
    expect(finish.mock.calls[0][0].output?.warnings).toEqual([
      "prohibited_term:best in Hong Kong",
      "compensation_promise",
    ]);
  });
  it.each(["viewer", "manager"])("denies %s before effects", async (role) => {
    const llm = vi.fn();
    await expect(
      run({
        membership: { ...membership, role, locationScope: ["other"] },
        llm,
        inputs: { spoof: true },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(queue).not.toHaveBeenCalled();
    expect(llm).not.toHaveBeenCalled();
  });
  it("checks location evidence of workspace-wide actions", async () => {
    row = { ...action, location_id: null } as unknown as typeof action;
    const llm = vi.fn();
    await expect(
      run({
        membership: {
          ...membership,
          role: "manager",
          locationScope: ["other"],
        },
        llm,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(queue).not.toHaveBeenCalled();
    expect(llm).not.toHaveBeenCalled();
  });
  it("permits in-scope manager on workspace-wide action", async () => {
    row = { ...action, location_id: null } as unknown as typeof action;
    expect(
      await run({
        membership: {
          ...membership,
          role: "manager",
          locationScope: ["loc-1"],
        },
        llm: vi.fn(async () => good()),
      }),
    ).toMatchObject({ versionId: "v-1" });
  });
  it("denies omitted or spoofed membership", async () => {
    for (const m of [
      undefined,
      { ...membership, workspaceId: "foreign" },
      { ...membership, userId: "foreign" },
    ])
      await expect(run({ membership: m, llm: vi.fn() })).rejects.toMatchObject({
        code: "forbidden",
      });
    expect(queue).not.toHaveBeenCalled();
  });
  it("refuses missing pinned evidence", async () => {
    row = {
      ...action,
      source_snapshot_id: "missing",
    } as unknown as typeof action;
    await expect(run({ llm: vi.fn() })).rejects.toMatchObject({
      code: "action_not_found",
    });
    expect(queue).not.toHaveBeenCalled();
  });
  it("requires owned approved social assets", async () => {
    row = {
      ...action,
      template_key: "social-post",
      provided_inputs: { asset_id: "foreign" },
    } as unknown as typeof action;
    const llm = vi.fn();
    expect(await run({ llm })).toMatchObject({
      factsNeeded: ["asset_or_text_only"],
    });
    expect(asset).toHaveBeenCalledWith("ws-1", "foreign");
    expect(llm).not.toHaveBeenCalled();
  });
  it("accepts approved owned asset or explicit text-only social run", async () => {
    row = {
      ...action,
      template_key: "social-post",
      provided_inputs: { asset_id: "owned" },
    } as unknown as typeof action;
    expect(
      await run({
        assets: { get: async () => ({ rights_status: "approved" }) },
        llm: vi.fn(async () => good({ alt_text: "Fixture image" })),
      }),
    ).toMatchObject({ versionId: "v-1" });
    expect(
      await run({
        inputs: { text_only: true },
        llm: vi.fn(async () => good()),
      }),
    ).toMatchObject({ versionId: "v-1" });
  });
  it("refuses unavailable agents", async () => {
    await expect(run({ agentKey: "nope" })).rejects.toMatchObject({
      code: "agent_unavailable",
    });
    expect(queue).not.toHaveBeenCalled();
  });
  it("caps each attempt's timeout by the remaining route budget", async () => {
    const llm = vi.fn<(prompt: string, options: { timeoutMs: number }) => Promise<LLMResult>>(async () => good());
    await run({ llm });
    const options = llm.mock.calls[0][1];
    // Never more than the agent default, and never more than what is left of
    // the route budget after reserving finalization time.
    expect(options.timeoutMs).toBeLessThanOrEqual(45_000);
    expect(options.timeoutMs).toBeLessThanOrEqual(AGENT_RUN_BUDGET_MS);
    expect(options.timeoutMs).toBeGreaterThan(0);
  });

  it("does not start a retry it cannot finish inside the route budget", async () => {
    // First attempt returns unparseable output after burning nearly the whole
    // budget. The old fixed two-attempt loop would have started a second 45 s
    // call inside a 60 s function; now the run ends as a terminal failure.
    const now = vi.spyOn(Date, "now");
    const base = 1_000_000;
    now.mockReturnValueOnce(base) // deadline computed
      .mockReturnValueOnce(base) // first attempt: full budget remains
      .mockReturnValue(base + AGENT_RUN_BUDGET_MS - 1_000); // budget nearly gone
    const llm = vi.fn(async () => ({ text: "not json", usage: { inputTokens: 1, outputTokens: 1 } }));
    try {
      const result = await run({ llm });
      expect(llm).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ state: "failed" });
    } finally {
      now.mockRestore();
    }
  });

  it("refuses a registered agent that is not this action template's own agent", async () => {
    // The gap this closes: isAgentKey() only proves membership of the global
    // agent registry, so any real key used to be accepted on any action --
    // e.g. asking for menu_translation on a review-response action.
    row = { ...action, template_key: "review-response" } as unknown as typeof action;
    await expect(run({ agentKey: "menu_translation" })).rejects.toMatchObject({
      code: "agent_unavailable",
    });
    expect(queue).not.toHaveBeenCalled();
  });
  it("accepts the action template's own agent when the client names it explicitly", async () => {
    row = { ...action, template_key: "review-response" } as unknown as typeof action;
    expect(await run({ agentKey: "review_reply", llm: vi.fn(async () => good()) })).toMatchObject({ versionId: "v-1" });
  });
  it.each([true, false])(
    "throws terminal persistence fault for valid=%s",
    async (valid) => {
      finish.mockRejectedValueOnce(new Error("artifact_run_operation_failed"));
      await expect(
        run({ llm: vi.fn(async () => (valid ? good() : null)) }),
      ).rejects.toThrow("artifact_run_operation_failed");
      expect(finish).toHaveBeenCalledTimes(1);
    },
  );
});

describe("snapshotEvidence website checks", () => {
  // P2.2 item 10: the agent was handed only the failing KEYS, so it could not
  // write "current -> suggested" or give the next scan item-level outcomes.
  const withChecks = {
    ...snapshotRow,
    website_checks: {
      evaluated: 15,
      passed: 12,
      results: [
        { key: "https", pass: true, detail: "example.test" },
        { key: "title", pass: true, detail: "57 chars" },
        { key: "meta_description_50_160", pass: false, detail: "0 chars" },
        { key: "single_h1", pass: false, detail: "2 h1" },
        { key: "canonical", pass: true },
      ],
    },
  };

  function checks(row: typeof withChecks) {
    const evidence = snapshotEvidence(rowToSnapshot(row as unknown as Parameters<typeof rowToSnapshot>[0]));
    return (evidence.snapshot as Record<string, unknown>).website_checks as {
      evaluated: number;
      passed: number;
      results: Array<{ key: string; pass: boolean; observed?: string }>;
    };
  }

  it("carries what each check observed, not just which ones failed", () => {
    const result = checks(withChecks);
    expect(result.results).toEqual([
      { key: "https", pass: true, observed: "example.test" },
      { key: "title", pass: true, observed: "57 chars" },
      { key: "meta_description_50_160", pass: false, observed: "0 chars" },
      { key: "single_h1", pass: false, observed: "2 h1" },
      { key: "canonical", pass: true },
    ]);
  });

  it("includes passing checks, because the agent rewrites the title either way", () => {
    const result = checks(withChecks);
    expect(result.results.filter((r) => r.pass).map((r) => r.key)).toContain("title");
    expect(result.evaluated).toBe(15);
    expect(result.passed).toBe(12);
  });

  it("stays null when no checks were recorded", () => {
    const evidence = snapshotEvidence(rowToSnapshot(snapshotRow as Parameters<typeof rowToSnapshot>[0]));
    expect((evidence.snapshot as Record<string, unknown>).website_checks).toBeNull();
  });
});
