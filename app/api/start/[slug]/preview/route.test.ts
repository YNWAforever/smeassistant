import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerToken, encodeViewerGrantCookie, VIEWER_GRANT_COOKIE } from "@/lib/report-access/token";

const mocks = vi.hoisted(() => ({
  authorizePreview: vi.fn(),
  parsePreviewInput: vi.fn(),
  claimSlot: vi.fn(),
  finishSlot: vi.fn(),
  previewJob: vi.fn(),
  enforceRateLimit: vi.fn(),
  llmComplete: vi.fn(),
  pauseState: vi.fn(),
  ipHashFor: vi.fn(),
  realParse: undefined as ((body: unknown) => unknown) | undefined,
}));

vi.mock("@/lib/preview/eligibility", () => ({ authorizePreview: (...args: unknown[]) => mocks.authorizePreview(...args) }));
vi.mock("@/lib/preview/input", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/preview/input")>();
  mocks.realParse = actual.parsePreviewInput;
  return { ...actual, parsePreviewInput: (body: unknown) => mocks.parsePreviewInput(body) };
});
vi.mock("@/lib/repositories/previews", () => ({
  previewRepository: () => ({
    claimSlot: (...args: unknown[]) => mocks.claimSlot(...args),
    finishSlot: (...args: unknown[]) => mocks.finishSlot(...args),
    previewJob: (...args: unknown[]) => mocks.previewJob(...args),
  }),
}));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));
vi.mock("@/lib/llm", () => ({ llmComplete: (...args: unknown[]) => mocks.llmComplete(...args), llmConfigured: () => true }));
vi.mock("@/lib/budgets/pause", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/budgets/pause")>()),
  pauseState: () => mocks.pauseState(),
}));
// Only ipHashFor is used (ruling R1); the factory keeps the audit module's database graph out of this file.
vi.mock("@/lib/workspace/audit", () => ({ ipHashFor: (...args: unknown[]) => mocks.ipHashFor(...args) }));

const SLUG = "share-slug-1";
const JOB = { id: "11111111-1111-4111-8111-111111111111", status: "done", region: "hk", businessName: "Kam Man House" };
const GRANT_ID = "33333333-3333-4333-8333-333333333333";
const EVENT_ID = "44444444-4444-4444-8444-444444444444";
const REVIEW = "Waited forty minutes for the roast goose and nobody apologised.";
const REPLY = "Thank you for telling us about the wait. We are adding a second roaster at lunch. We hope to welcome you back.";
const token = createViewerToken();
const COOKIE = `${VIEWER_GRANT_COOKIE}=${encodeURIComponent(encodeViewerGrantCookie(GRANT_ID, token.rawToken))}`;

function modelOutput(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ title: "Reply", body: REPLY, acceptance_criteria: [], warnings: [], facts_used: [], facts_needed: [], ...overrides });
}

function llmResult(text: string) {
  return { text, usage: { inputTokens: 1000, outputTokens: 500 } };
}

const EXPECTED_COST = 0.0006; // 1000/1000 × 0.0002 + 500/1000 × 0.0008

/**
 * Ruling R11: with no reported usage the slot records a conservative estimate —
 * ceil(prompt length / 2) input tokens and the full 1,200 output tokens — at the default rates.
 */
function estimatedCost(): number {
  const prompt = String(mocks.llmComplete.mock.calls[0]?.[0] ?? "");
  expect(prompt.length).toBeGreaterThan(0);
  const cost = (Math.ceil(prompt.length / 2) / 1000) * 0.0002 + (1200 / 1000) * 0.0008;
  return Math.round(cost * 1e6) / 1e6;
}

async function post(body: unknown = { review: REVIEW, rating: 2, locale: "en" }, cookie: string | null = COOKIE) {
  const { POST } = await import("./route");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return POST(
    new Request(`https://app.test/api/start/${SLUG}/preview`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }),
    { params: Promise.resolve({ slug: SLUG }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PREVIEW_DRAFT_ENABLED", "true");
  vi.stubEnv("PREVIEW_DRAFT_DAILY_LIMIT", "");
  vi.stubEnv("PREVIEW_DRAFT_USD_DAILY", "");
  vi.stubEnv("LLM_COST_PER_1K_INPUT_TOKENS_USD", "");
  vi.stubEnv("LLM_COST_PER_1K_OUTPUT_TOKENS_USD", "");
  mocks.parsePreviewInput.mockImplementation((body: unknown) => mocks.realParse?.(body));
  mocks.authorizePreview.mockResolvedValue({ job: JOB, grantId: GRANT_ID });
  mocks.pauseState.mockReturnValue({ scans: false, ai: false, mail: false });
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.claimSlot.mockResolvedValue({ allowed: true, eventId: EVENT_ID });
  mocks.finishSlot.mockResolvedValue(undefined);
  mocks.llmComplete.mockResolvedValue(llmResult(modelOutput()));
  mocks.ipHashFor.mockReturnValue("ip-hash-1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function expectNoStore(res: Response) {
  expect(res.headers.get("cache-control")).toBe("no-store");
}

describe("POST /api/start/[slug]/preview", () => {
  it("allows up to 60 seconds", async () => {
    expect((await import("./route")).maxDuration).toBe(60);
  });

  it.each(["", "false", "TRUE", undefined])("flag %j → 404 not_enabled with no parse, auth, repo or model call", async (value) => {
    vi.stubEnv("PREVIEW_DRAFT_ENABLED", value);
    const res = await post({ review: REVIEW, locale: "en" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_enabled" });
    expectNoStore(res);
    expect(mocks.parsePreviewInput).not.toHaveBeenCalled();
    expect(mocks.authorizePreview).not.toHaveBeenCalled();
    expect(mocks.previewJob).not.toHaveBeenCalled();
    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.llmComplete).not.toHaveBeenCalled();
  });

  it("400 invalid_input before eligibility for a bad body", async () => {
    for (const body of [{ review: "too short", locale: "en" }, { review: REVIEW, rating: 6, locale: "en" }, { review: REVIEW, locale: "fr" }, "{not json", "[]"]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ state: "refused", reason: "invalid_input" });
      expectNoStore(res);
    }
    expect(mocks.authorizePreview).not.toHaveBeenCalled();
    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.llmComplete).not.toHaveBeenCalled();
  });

  it("authorizes the slug with the sme_report_grant cookie", async () => {
    await post();
    expect(mocks.authorizePreview).toHaveBeenCalledWith(expect.objectContaining({ slug: SLUG, viewerToken: { grantId: GRANT_ID, rawToken: token.rawToken } }));

    mocks.authorizePreview.mockClear();
    await post(undefined, `other=1; ${VIEWER_GRANT_COOKIE}=%zz`);
    expect(mocks.authorizePreview).toHaveBeenCalledWith(expect.objectContaining({ slug: SLUG, viewerToken: null }));

    mocks.authorizePreview.mockClear();
    await post(undefined, null);
    expect(mocks.authorizePreview).toHaveBeenCalledWith(expect.objectContaining({ slug: SLUG, viewerToken: null }));
  });

  it("404 when authorizePreview returns null", async () => {
    mocks.authorizePreview.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expectNoStore(res);
    expect(mocks.pauseState).not.toHaveBeenCalled();
    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.llmComplete).not.toHaveBeenCalled();
  });

  it("404 when the eligibility lookup throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.authorizePreview.mockRejectedValue(new Error("preview_operation_failed"));
    const res = await post();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.llmComplete).not.toHaveBeenCalled();
  });

  it("paused → refused paused, no claim, no model", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.pauseState.mockReturnValue({ scans: false, ai: true, mail: false });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "refused", reason: "paused" });
    expectNoStore(res);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.llmComplete).not.toHaveBeenCalled();
  });

  it("bad limits → unavailable, no claim, no model", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [name, value] of [["PREVIEW_DRAFT_DAILY_LIMIT", "fifty"], ["PREVIEW_DRAFT_USD_DAILY", "-1"]] as const) {
      vi.stubEnv(name, value);
      const res = await post();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ state: "refused", reason: "unavailable" });
      vi.stubEnv(name, "");
    }
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.llmComplete).not.toHaveBeenCalled();
  });

  it("ip limit → refused ip_limit, no claim", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 3600 });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "refused", reason: "ip_limit" });
    expectNoStore(res);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "preview_draft", failClosed: true }));
    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.llmComplete).not.toHaveBeenCalled();
  });

  it("an unavailable limiter → unavailable (fail-closed), no claim", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 86400, unavailable: true });
    const res = await post();
    expect(res.status).toBe(200);
    expectNoStore(res);
    expect(await res.json()).toEqual({ state: "refused", reason: "unavailable" });
    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.llmComplete).not.toHaveBeenCalled();
  });

  it("claims with the job, the grant, the R1 ip hash and the limits", async () => {
    vi.stubEnv("PREVIEW_DRAFT_DAILY_LIMIT", "7");
    vi.stubEnv("PREVIEW_DRAFT_USD_DAILY", "0.5");
    await post();
    expect(mocks.claimSlot).toHaveBeenCalledWith({ jobId: JOB.id, grantId: GRANT_ID, ipHash: "ip-hash-1", globalDaily: 7, usdDaily: 0.5 });

    mocks.ipHashFor.mockReturnValue(null);
    await post();
    expect(mocks.claimSlot).toHaveBeenLastCalledWith(expect.objectContaining({ ipHash: null }));
  });

  it.each(["already_used", "job_limit", "daily_limit", "budget"])("claim refuses %s → that reason, no model", async (reason) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.claimSlot.mockResolvedValue({ allowed: false, reason });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "refused", reason });
    expectNoStore(res);
    expect(mocks.llmComplete).not.toHaveBeenCalled();
    expect(mocks.finishSlot).not.toHaveBeenCalled();
  });

  it("claim throws → unavailable, no model", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.claimSlot.mockRejectedValue(new Error("preview_operation_failed"));
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "refused", reason: "unavailable" });
    expect(mocks.llmComplete).not.toHaveBeenCalled();
    expect(mocks.finishSlot).not.toHaveBeenCalled();
  });

  it.each([
    ["null result", "no_output", null, "estimate"],
    ["bad JSON", "invalid_output", llmResult("not json at all"), EXPECTED_COST],
    ["facts_needed", "facts_needed", llmResult(modelOutput({ body: "", facts_needed: ["opening_hours"] })), EXPECTED_COST],
    ["facts_needed with a body", "facts_needed", llmResult(modelOutput({ facts_needed: ["opening_hours"] })), EXPECTED_COST],
  ] as const)("%s → finish failed with reason %s and cost, unavailable", async (_label, reason, result, cost) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.llmComplete.mockResolvedValue(result);
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "refused", reason: "unavailable" });
    expect(mocks.llmComplete).toHaveBeenCalledTimes(1);
    expect(mocks.finishSlot).toHaveBeenCalledWith({ eventId: EVENT_ID, outcome: "failed", reason, costUsd: cost === "estimate" ? estimatedCost() : cost });
  });

  it("a throwing model call is treated as no output and still finishes the slot with the cost estimate", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.llmComplete.mockRejectedValue(new Error("boom"));
    const res = await post();
    expect(await res.json()).toEqual({ state: "refused", reason: "unavailable" });
    expect(mocks.finishSlot).toHaveBeenCalledWith({ eventId: EVENT_ID, outcome: "failed", reason: "no_output", costUsd: estimatedCost() });
  });

  it("missing usage records the conservative estimate, never 0 (R11)", async () => {
    mocks.llmComplete.mockResolvedValue({ text: modelOutput(), usage: { inputTokens: null, outputTokens: null } });
    await post();
    const cost = estimatedCost();
    expect(cost).toBeGreaterThan(0.00096); // at least the 1,200 output tokens
    expect(mocks.finishSlot).toHaveBeenCalledWith({ eventId: EVENT_ID, outcome: "generated", reason: null, costUsd: cost });
  });

  it("partly missing usage also records the estimate", async () => {
    mocks.llmComplete.mockResolvedValue({ text: modelOutput(), usage: { inputTokens: 1000, outputTokens: null } });
    await post();
    expect(mocks.finishSlot).toHaveBeenCalledWith({ eventId: EVENT_ID, outcome: "generated", reason: null, costUsd: estimatedCost() });
  });

  it("reported usage is recorded as the real cost, not the estimate", async () => {
    await post();
    expect(EXPECTED_COST).not.toBe(estimatedCost());
    expect(mocks.finishSlot).toHaveBeenCalledWith({ eventId: EVENT_ID, outcome: "generated", reason: null, costUsd: EXPECTED_COST });
  });

  it("success → finish generated with cost; returns body and acceptance warnings", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expectNoStore(res);
    expect(await res.json()).toEqual({ state: "generated", body: REPLY, warnings: [] });
    expect(mocks.llmComplete).toHaveBeenCalledTimes(1);
    // The agent options, plus redactErrors so a provider error body echoing the review is never logged.
    expect(mocks.llmComplete).toHaveBeenCalledWith(expect.any(String), { jsonMode: true, temperature: 0.4, maxTokens: 1200, timeoutMs: 45_000, redactErrors: true });
    expect(mocks.finishSlot).toHaveBeenCalledWith({ eventId: EVENT_ID, outcome: "generated", reason: null, costUsd: EXPECTED_COST });

    // Review Focus 5: a compensation promise is flagged, after the model's own warnings.
    mocks.llmComplete.mockResolvedValue(
      llmResult(modelOutput({ body: "Sorry about the wait. Next time we will give you a free drink and a full refund.", warnings: ["check_tone"] })),
    );
    const flagged = await post();
    expect(await flagged.json()).toEqual({
      state: "generated",
      body: "Sorry about the wait. Next time we will give you a free drink and a full refund.",
      warnings: ["check_tone", "compensation_promise"],
    });
  });

  it("returns the decided outcome even when finishing the slot throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.finishSlot.mockRejectedValue(new Error("preview_operation_failed"));
    expect(await (await post()).json()).toEqual({ state: "generated", body: REPLY, warnings: [] });
    mocks.llmComplete.mockResolvedValue(null);
    expect(await (await post()).json()).toEqual({ state: "refused", reason: "unavailable" });
    expect(error).toHaveBeenCalledWith(expect.any(String), { category: "preview_finish_failed" });
  });

  it("the second of two concurrent requests for one grant gets already_used", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.claimSlot.mockReset();
    mocks.claimSlot.mockResolvedValueOnce({ allowed: true, eventId: EVENT_ID }).mockResolvedValue({ allowed: false, reason: "already_used" });
    const [a, b] = await Promise.all([post(), post()]);
    const bodies = [await a.json(), await b.json()];
    expect(bodies).toContainEqual({ state: "generated", body: REPLY, warnings: [] });
    expect(bodies).toContainEqual({ state: "refused", reason: "already_used" });
    expect(mocks.claimSlot).toHaveBeenCalledTimes(2);
    expect(mocks.llmComplete).toHaveBeenCalledTimes(1);
  });

  it("never echoes the review text in any response or log call", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    const responses: unknown[] = [];
    const run = async () => {
      const res = await post();
      responses.push({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.json() });
    };

    await run(); // generated
    mocks.llmComplete.mockResolvedValueOnce(null);
    await run(); // no_output
    mocks.llmComplete.mockResolvedValueOnce(llmResult(`{"body": ${JSON.stringify(REVIEW)}`)); // unparsable, quoting the review
    await run(); // invalid_output
    mocks.finishSlot.mockRejectedValueOnce(new Error(REVIEW));
    await run(); // finish throws with the review in the message
    mocks.claimSlot.mockRejectedValueOnce(new Error(REVIEW));
    await run(); // claim throws
    mocks.claimSlot.mockResolvedValueOnce({ allowed: false, reason: "already_used" });
    await run();
    mocks.authorizePreview.mockRejectedValueOnce(new Error(REVIEW));
    await run(); // eligibility throws

    expect(JSON.stringify(responses)).not.toContain(REVIEW);
    expect(JSON.stringify(responses)).not.toContain("forty minutes");
    const logged = spies.flatMap((spy) => spy.mock.calls);
    expect(logged.length).toBeGreaterThan(0);
    for (const call of logged) {
      const text = call.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : JSON.stringify(arg))).join(" ");
      expect(text).not.toContain("forty minutes");
      expect(text).not.toContain(REPLY);
      // Logs carry only a category.
      for (const arg of call.slice(1)) expect(Object.keys(arg as object)).toEqual(["category"]);
    }
  });

  it("asks llmComplete to redact provider error text from its logs", async () => {
    await post();
    expect(mocks.llmComplete).toHaveBeenCalledTimes(1);
    expect(mocks.llmComplete.mock.calls[0][1]).toMatchObject({ redactErrors: true });
  });

  it("passes the model only the preview context", async () => {
    await post({ review: REVIEW, rating: 2, locale: "zh-HK" });
    const prompt = mocks.llmComplete.mock.calls[0][0] as string;
    expect(prompt).toContain(REVIEW);
    expect(prompt).toContain(JOB.businessName);
    for (const key of ["snapshot", "finding", "raw_data"]) expect(prompt).not.toContain(key);
    expect(prompt).not.toContain('"factType": "Observed"');
    expect(mocks.previewJob).not.toHaveBeenCalled();
  });

  it("maps a tw job region to the tw market", async () => {
    const { AGENTS } = await import("@/lib/agents");
    const build = vi.spyOn(AGENTS.review_reply, "buildPrompt");
    mocks.authorizePreview.mockResolvedValue({ job: { ...JOB, region: "tw" }, grantId: GRANT_ID });
    await post({ review: REVIEW, locale: "zh-TW" });
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ market: "tw", locale: "zh-TW", location: { name: JOB.businessName } }));
  });
});
