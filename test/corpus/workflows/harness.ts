import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { runAgentForAction, type RunAgentResult } from "@/lib/workspace/runs";
import { TEMPLATES, templateByKey, type TemplateKey } from "@/lib/workspace/templates";
import { rowToSnapshot } from "@/lib/workspace/snapshots";
import type { llmComplete, LLMResult } from "@/lib/llm";
import type {
  ActionRunRepository,
  ArtifactRepository,
  FinishActionRunInput,
} from "@/lib/repositories/artifacts";
import type { Membership } from "@/lib/auth";
import type { Offer } from "@/lib/workspace/offers";

/**
 * Regression corpus for the supported workflows (P4.4).
 *
 * Canned outputs prove the pipeline handles each behaviour; they do not prove
 * any model behaves. The same runner is reused by the evaluation script with a
 * real model, where the assertions are reported rather than gating CI.
 */

const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key) as [TemplateKey, ...TemplateKey[]];

export const CATEGORIES = [
  "malicious_review",
  "missing_facts",
  "locale_market",
  "fabricated_claim",
  "uncertain_evidence",
  "provider_failure",
  "invalid_output",
] as const;

export const CATEGORY_MINIMUMS: Record<(typeof CATEGORIES)[number], number> = {
  malicious_review: 3,
  missing_facts: 3,
  locale_market: 2,
  fabricated_claim: 2,
  uncertain_evidence: 2,
  provider_failure: 2,
  invalid_output: 2,
};

export const corpusCaseSchema = z.object({
  id: z.string().min(1),
  category: z.enum(CATEGORIES),
  workflow: z.enum(TEMPLATE_KEYS),
  locale: z.enum(["en", "zh-HK", "zh-TW"]),
  market: z.enum(["hk", "tw"]),
  provided: z.record(z.string(), z.unknown()),
  brand: z
    .object({
      approvedClaims: z.array(z.string()).optional(),
      prohibitedTerms: z.array(z.string()).optional(),
      facts: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  reviews: z
    .array(
      z.object({
        rating: z.number(),
        text: z.string(),
        time: z.string(),
        // Seeds an already-answered review the agent must never see. Omitted means unanswered.
        owner_response: z.string().nullable().optional(),
      }),
    )
    .optional(),
  // The offer an offer-* workflow reads (P4.1). Omitted means the action has no offer_id.
  offer: z
    .object({
      title: z.string(),
      details: z.string(),
      terms: z.string().default(""),
      price_amount: z.number().nullable().default(null),
      currency: z.enum(["HKD", "TWD"]).nullable().default(null),
      valid_from: z.string(),
      valid_until: z.string(),
      claims: z.array(z.string()).default([]),
      prohibited_terms: z.array(z.string()).default([]),
      status: z.enum(["draft", "confirmed", "archived"]).default("confirmed"),
      expired: z.boolean().default(false),
      revision: z.number().int().min(1).default(1),
    })
    .optional(),
  // A string is the model's text, null is llmComplete's "no answer", and
  // { throws } makes that call reject (a timeout or transport error).
  cannedOutputs: z.array(z.union([z.string(), z.null(), z.object({ throws: z.string().min(1) })])),
  expect: z.object({
    llmCalls: z.number().int().min(0),
    factsNeeded: z.array(z.string()).optional(),
    state: z.enum(["succeeded", "failed"]).optional(),
    version: z.boolean().optional(),
    warningsInclude: z.array(z.string()).optional(),
    warningsExclude: z.array(z.string()).optional(),
    promptIncludes: z.array(z.string()).optional(),
    promptExcludes: z.array(z.string()).optional(),
    /** The failure reason the run finished with (e.g. action_run_failed). */
    reason: z.string().optional(),
  }),
});

export type CorpusCase = z.infer<typeof corpusCaseSchema>;

const CASES_DIR = fileURLToPath(new URL("./cases/", import.meta.url));

/** Parses one case file; both JSON syntax and schema failures throw an error that names the file. */
export function parseCorpusCase(name: string, text: string): CorpusCase {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid corpus case ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = corpusCaseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`Invalid corpus case ${name}: ${parsed.error.message}`);
  return parsed.data;
}

export function loadCorpus(): CorpusCase[] {
  return readdirSync(CASES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => parseCorpusCase(name, readFileSync(CASES_DIR + name, "utf8")));
}

export interface CorpusRun {
  result: RunAgentResult;
  prompts: string[];
  finishInput: FinishActionRunInput;
  llmCalls: number;
}

const membership: Membership = {
  workspaceId: "ws-corpus",
  workspaceSlug: "corpus",
  userId: "user-corpus",
  email: "corpus@example.test",
  role: "owner",
  locationScope: null,
};

/** Runs one case through the real run pipeline against an in-memory repository. */
export async function runCorpusCase(c: CorpusCase, llm: typeof llmComplete): Promise<CorpusRun> {
  const template = templateByKey(c.workflow);
  const row = {
    id: "act-corpus",
    workspace_id: "ws-corpus",
    location_id: "loc-corpus",
    template_key: c.workflow,
    source: "finding",
    source_finding_keys: template.triggerFindingKeys.slice(0, 1),
    source_snapshot_id: null,
    title: { en: "Action", "zh-HK": "行動", "zh-TW": "行動" },
    summary: { en: "", "zh-HK": "", "zh-TW": "" },
    evidence: {},
    priority: "high",
    priority_score: 70,
    priority_factors: [],
    effort_minutes: template.effortMinutes,
    required_inputs: template.requiredInputs,
    provided_inputs: c.provided,
    assignee_user_id: null,
    due_at: null,
    action_state: "recommended",
    measurement_state: "not_eligible",
    capability: template.capability,
    offer_id: c.offer ? "offer-corpus" : null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };
  const snapshot = rowToSnapshot({
    id: "snap-corpus",
    job_id: "job-corpus",
    workspace_id: "ws-corpus",
    location_id: "loc-corpus",
    market: c.market,
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
  } as unknown as Parameters<typeof rowToSnapshot>[0]);
  const rawData = {
    gbp: {
      reviews: (c.reviews ?? []).map((r) => ({
        rating: r.rating,
        text: r.text,
        time: r.time,
        owner_response: r.owner_response ?? null,
      })),
    },
  };
  const db = {
    actionScope: async () => ({ actionId: row.id, workspaceId: row.workspace_id, locationId: row.location_id }),
    assistantActions: async () => [row],
    assistantSnapshot: async () => null,
    assistantLatestSnapshot: async () => snapshot,
    assistantAeoQueries: async () => [] as string[],
    assistantWorkspace: async () => ({ business_name: "Corpus Cafe", market: c.market, timezone: c.market === "tw" ? "Asia/Taipei" : "Asia/Hong_Kong" }),
    assistantLocations: async () => [
      { id: "loc-corpus", slug: "corpus", name: "Corpus Cafe", address: null, district: null },
    ],
    assistantBrand: async () => ({
      voice: "warm",
      approved_claims: c.brand?.approvedClaims ?? [],
      prohibited_terms: c.brand?.prohibitedTerms ?? [],
      languages: [],
      facts: c.brand?.facts ?? {},
    }),
    assistantReviewData: async () => rawData,
    aiSpend24h: async () => ({ globalUsd: 0, workspaceUsd: 0 }),
  } as unknown as ArtifactRepository;

  let finishInput: FinishActionRunInput | undefined;
  const persistence: ActionRunRepository = {
    queue: async () => "run-corpus",
    start: async () => {},
    finish: async (input) => {
      finishInput = input;
      if (input.error) return { runId: input.runId, state: "failed" as const, error: input.error };
      const needed = input.output?.facts_needed.length ? input.output.facts_needed : input.factsNeeded;
      return needed?.length
        ? { runId: input.runId, state: "succeeded" as const, factsNeeded: needed }
        : { runId: input.runId, state: "succeeded" as const, versionId: "v-corpus", versionNo: 1 };
    },
  };

  const offer: Offer | null = c.offer
    ? {
        id: "offer-corpus",
        workspaceId: "ws-corpus",
        locationId: "loc-corpus",
        title: c.offer.title,
        details: c.offer.details,
        terms: c.offer.terms,
        priceAmount: c.offer.price_amount,
        currency: c.offer.currency,
        validFrom: c.offer.valid_from,
        validUntil: c.offer.valid_until,
        claims: c.offer.claims,
        prohibitedTerms: c.offer.prohibited_terms,
        assetId: null,
        status: c.offer.status,
        revision: c.offer.revision,
        confirmedAt: c.offer.status === "confirmed" ? "2026-09-30T00:00:00Z" : null,
        expired: c.offer.expired,
        createdAt: "2026-09-30T00:00:00Z",
        updatedAt: "2026-09-30T00:00:00Z",
      }
    : null;

  const prompts: string[] = [];
  const recording = (async (prompt, options) => {
    prompts.push(prompt);
    return llm(prompt, options);
  }) as typeof llmComplete;

  const result = await runAgentForAction(db, {
    actionId: row.id,
    actorId: membership.userId,
    locale: c.locale,
    membership,
    persistence,
    // Keeps the corpus database-free: text_only cases satisfy the asset gate without a lookup.
    assets: { get: async () => null },
    offers: { get: async (workspaceId, offerId) => (offer && workspaceId === offer.workspaceId && offerId === offer.id ? offer : null) },
    llm: recording,
    budgetEnv: {},
    // The corpus exercises the shipped feature: promotion_copy cases run with the P4.1 flag on.
    featureEnv: { OFFER_PROMOTIONS_ENABLED: "true" },
  });
  if (!finishInput) throw new Error(`Case ${c.id}: persistence.finish was never called`);
  return { result, prompts, finishInput, llmCalls: prompts.length };
}

/**
 * A fake model returning the canned outputs in order; null when canned null or
 * once exhausted, and a rejected call for a `{ throws }` entry.
 */
export function cannedLlm(outputs: ReadonlyArray<CorpusCase["cannedOutputs"][number]>): typeof llmComplete {
  let next = 0;
  return (async () => {
    const canned = outputs[next++];
    if (canned === undefined || canned === null) return null;
    if (typeof canned !== "string") throw new Error(canned.throws);
    return { text: canned, usage: { inputTokens: 100, outputTokens: 50 } } satisfies LLMResult;
  }) as typeof llmComplete;
}
