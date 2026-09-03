import type { IGPayload } from "@sme-scanner/scoring";
import type { IgMatchProvenance } from "@sme-scanner/contracts";
import type { ProviderConfidence } from "./provider-result";

const RANK: Record<ProviderConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * How sure we are the scanned handle belongs to this merchant, expressed as a
 * CEILING on the module's confidence. A hand-typed handle is unverified -- the
 * merchant may have typed a competitor's, or a personal account -- so it can
 * never present as `high` no matter how rich the profile is.
 *
 * `null` (a job scanned before match provenance existed) is treated as
 * `manual_typed`, because that is exactly what those jobs were.
 */
const PROVENANCE_CEILING: Record<IgMatchProvenance, ProviderConfidence> = {
  manual_typed: "medium",
  picker_confirmed: "high",
  gbp_cross_referenced: "high",
};

/**
 * Grades a measured IG payload's confidence from what actually varied in
 * collection, then lowers it to what the match provenance can support.
 *
 * `posts_last_12` is the discriminator: `ig.content_consistency`,
 * `ig.content_mix` and `ig.engagement_low` are all assessed against it, so its
 * absence is the low-confidence floor regardless of anything else in the
 * payload. `bio` is the secondary signal once posts are present.
 */
export function resolveIgConfidence(
  payload: IGPayload,
  provenance: IgMatchProvenance | null,
): ProviderConfidence {
  const hasPosts = Boolean(payload.posts_last_12 && payload.posts_last_12.length > 0);
  // Trimmed on purpose: a whitespace-only bio is a blank bio. Boolean("   ")
  // is true, which would grade an empty profile "high".
  const hasBio = typeof payload.bio === "string" && payload.bio.trim().length > 0;
  const fromPayload: ProviderConfidence = !hasPosts ? "low" : hasBio ? "high" : "medium";

  const ceiling = PROVENANCE_CEILING[provenance ?? "manual_typed"];
  // A ceiling, never a floor: unverified provenance cannot lower a payload
  // grade below what the data already earned, and strong provenance cannot
  // raise a thin payload.
  return RANK[fromPayload] <= RANK[ceiling] ? fromPayload : ceiling;
}
