import type { AgentContext } from "@/lib/agents/schema";
import type { PrototypeLocale } from "@/lib/copy";
import { resolveBrandProvidedInputs } from "@/lib/workspace/evidence-inputs";
import { buildActionOverview, type ActionRow } from "@/lib/workspace/overview";
import { findTemplate } from "@/lib/workspace/templates";

/**
 * The review_reply agent context of the unsaved preview draft (spec §2.3).
 *
 * The model gets only the locale, the market, the business name, the default
 * brand and the one review the viewer pasted. Nothing from the report,
 * snapshot, findings or raw data is read or passed, so `evidence` is empty,
 * `providedInputs` holds only the default brand's voice and language (ruling
 * R10, resolved exactly as the normal run path does, so the prompt never asks
 * for a "(not provided)" voice), and the review travels only in
 * `sampledReviews`, which the prompt renders inside the untrusted-evidence
 * fence, marked `visitor_pasted` so it is never described as scan evidence.
 */
export interface PreviewContextInput {
  locale: PrototypeLocale;
  market: "hk" | "tw";
  businessName: string;
  review: string;
  rating: number | null;
}

/** The job's `region` decides the market: `tw` (any case) is Taiwan, anything else Hong Kong. */
export function previewMarket(region: string | null): "hk" | "tw" {
  return region?.toLowerCase() === "tw" ? "tw" : "hk";
}

/**
 * An in-memory `review-response` action. It is never persisted: the ids are
 * placeholders and it names no finding or snapshot. Its evidence says only
 * that the text was visitor-supplied and unverified (ruling R5): left empty,
 * `buildActionOverview` would default it to `Observed`, a fact type the
 * pasted review has not earned.
 */
function previewActionRow(now: string): ActionRow {
  const template = findTemplate("review-response");
  if (!template) throw new Error("review_response_template_missing");
  return {
    id: "preview",
    workspace_id: "",
    location_id: null,
    template_key: template.key,
    source: "system",
    source_finding_keys: [],
    title: template.title,
    summary: template.summary,
    evidence: { factType: "Unknown", source: "visitor_supplied" },
    priority: "medium",
    priority_score: 0,
    priority_factors: [],
    effort_minutes: template.effortMinutes,
    required_inputs: [],
    provided_inputs: {},
    assignee_user_id: null,
    due_at: null,
    action_state: "recommended",
    measurement_state: "not_eligible",
    capability: template.capability,
    created_at: now,
    updated_at: now,
  };
}

export function buildPreviewContext(input: PreviewContextInput): AgentContext {
  const action = buildActionOverview(previewActionRow(new Date().toISOString()), {
    location: null,
    latestRun: null,
    latestVersion: null,
  });
  const brand = { voice: "warm", approvedClaims: [], prohibitedTerms: [], languages: [input.locale], facts: {} };
  return {
    locale: input.locale,
    market: input.market,
    brand,
    location: { name: input.businessName },
    action,
    evidence: {},
    providedInputs: resolveBrandProvidedInputs({ voice: brand.voice, languages: brand.languages, approvedClaims: brand.approvedClaims }),
    sampledReviews: [{ rating: input.rating ?? null, text: input.review, time: null }],
    // Ruling R4: the prompt must not describe a pasted review as scan evidence.
    sampledReviewsSource: "visitor_pasted",
  };
}
