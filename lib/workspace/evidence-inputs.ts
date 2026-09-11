import type { SampledReview } from "@/lib/agents";
import { sanitizeReportProof } from "@/lib/report/sanitize-proof";

/**
 * Which "required inputs" the server can already answer from stored evidence.
 *
 * The scan collects the merchant's unanswered Google reviews and the agent
 * drafts from them -- but the action's `required_inputs` still listed
 * `reviews_without_response`, so the owner was shown a blank textarea asking
 * them to retype reviews the workspace had already collected, and the action sat
 * in `needs_input` until they did.
 *
 * This module is the single place that decides what counts as already-supplied.
 * It reads STORED EVIDENCE ONLY and never accepts client input: owner-typed text
 * stays in `provided_inputs`, and `ctx.sampledReviews` is still built solely from
 * `audit_jobs.raw_data`.
 *
 * Deliberately narrow. `brand_voice` and `language` look resolvable from
 * `brand_profiles`, but the agents read them through `inputLine(ctx, key)` ->
 * `ctx.providedInputs`, so removing them from `required_inputs` would silently
 * render "Match the brand voice ((not provided))" AND lock the owner out of ever
 * supplying them (the detail page's input form is driven by what is missing).
 * Resolving those is a separate change that must also inject the values into
 * `providedInputs`. Everything else -- approved_claim, cta_link, channel,
 * owner_fact_*, menu_items, opening_hours, categories, asset_or_text_only,
 * alt_text, google_account_owner -- is genuinely owner knowledge.
 */
export const SERVER_RESOLVABLE_INPUT_KEYS = ["reviews_without_response"] as const;

export interface ScannedReviewSelection {
  sampled: SampledReview[];
  /**
   * How many reviews the scan RETAINED (sanitizeReportProof caps this at 3), not
   * the five that deriveMetrics inspects. The disclosure and the derivation
   * decision must both use this number: quoting the metric would promise the
   * agent reviews it never receives.
   */
  inspected: number;
}

export function selectScannedReviews(rawData: unknown): ScannedReviewSelection {
  const proof = sanitizeReportProof(rawData, []);
  const retained = proof.gbp?.recentReviews ?? [];
  return {
    inspected: retained.length,
    sampled: retained
      .filter((review) => !review.ownerResponse && review.text)
      .sort((a, b) => (b.time || "").localeCompare(a.time || ""))
      .map((review) => ({
        rating: review.rating || null,
        text: review.text.slice(0, 500),
        time: review.time || null,
      })),
  };
}

/** The name lib/workspace/runs.ts and lib/assistant/live.ts already import. */
export function sampledReviewsFromRawData(rawData: unknown): SampledReview[] {
  return selectScannedReviews(rawData).sampled;
}

/**
 * A stable handle for one sampled review, so the owner can choose which reviews
 * to answer (Master Plan §5 P2.2: "Selected-review replies").
 *
 * Content-derived rather than positional. An index would silently re-point at a
 * different review the moment a new scan reorders the sample, turning the
 * owner's choice quietly wrong rather than visibly stale. Derived from the
 * review's own time and text, so the same stored evidence always yields the
 * same key and a re-derivation still matches.
 *
 * It is a lookup handle, not a secret: it travels to the client and back, and
 * all it can do is select from a list the server rebuilt from
 * `audit_jobs.raw_data`. That is the point -- see `filterSelectedReviews`.
 */
// Takes the whole review but reads only `time` and `text`: the rating is
// editorial and can be absent, so folding it in would make the key unstable.
export function scannedReviewKey(review: SampledReview): string {
  // FNV-1a. Collision resistance is irrelevant here: the worst case is drafting
  // from one extra review the scan did collect, never from invented text.
  let hash = 0x811c9dc5;
  const source = `${review.time ?? ""}|${review.text}`;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Narrow the server-derived sample to the reviews the owner picked.
 *
 * The selection is a FILTER, never a source. The client sends keys; the review
 * text still comes only from stored evidence, so a caller cannot smuggle a
 * review the scan never collected into the prompt -- the property the module
 * docstring above exists to protect.
 *
 * Absent or empty means "all of them", so every action created before this
 * feature behaves exactly as it did. A selection matching nothing also falls
 * back to all: the owner's stored choice has gone stale against a newer scan,
 * and drafting from every unanswered review is a better answer than drafting
 * from none -- which would otherwise produce an empty evidence block and invite
 * the model to invent one.
 */
export function filterSelectedReviews(sampled: SampledReview[], selected: unknown): SampledReview[] {
  if (!Array.isArray(selected) || selected.length === 0) return sampled;
  const keys = new Set(selected.filter((key): key is string => typeof key === "string"));
  if (keys.size === 0) return sampled;
  const picked = sampled.filter((review) => keys.has(scannedReviewKey(review)));
  return picked.length > 0 ? picked : sampled;
}

export interface EvidenceInputSources {
  rawData: unknown;
}

export function resolveEvidenceInputs(sources: EvidenceInputSources): Set<string> {
  const resolved = new Set<string>();
  if (selectScannedReviews(sources.rawData).sampled.length > 0) resolved.add("reviews_without_response");
  return resolved;
}

/** What the owner must still supply, given what the evidence already answers. */
export function applyResolvedInputs(required: readonly string[], resolved: ReadonlySet<string>): string[] {
  return required.filter((key) => !resolved.has(key));
}
