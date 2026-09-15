import type { ApplicationRepository } from "@/lib/repositories/applications";

/**
 * Owner-asserted and verifier-confirmed application evidence
 * (docs/superpowers/specs/2026-09-16-applied-evidence-design.md).
 *
 * The Master Plan requires four events kept distinct: approved/exported, owner
 * says applied, provider verifies applied, and later observed metric change.
 * This module owns the middle two and the rule for which of the three
 * attribution signals wins.
 */
export type ApplicationSource = "owner_asserted" | "verified";
export type AttributionBasis = "exported" | "owner_asserted" | "verified";

export interface ApplicationRecord {
  id: string;
  action_id: string;
  source: ApplicationSource;
  asserted_at: string;
  retracted_at: string | null;
}

/**
 * Precedence: verified > owner_asserted > exported.
 *
 * This inverts the intuitive order deliberately. An export only tells us a file
 * left the building; the Master Plan says so directly -- "'Exported' is not
 * 'published' or 'implemented.'" The owner saying they published it is a closer
 * claim about the world even though it is unverified, so it outranks the
 * export. Only an independent check outranks the owner.
 *
 * `headStartedAt` is the same gate `first_exported_at` already passes: evidence
 * dated after the head scan started cannot explain that scan's numbers, and
 * honouring it would be precisely the "causal claim from timing alone" the
 * plan forbids.
 */
export function strongestBasis(
  applications: readonly ApplicationRecord[],
  exportedBeforeHead: boolean,
  headStartedAt: number,
): AttributionBasis | null {
  let owner = false;
  for (const row of applications) {
    if (row.retracted_at) continue;
    const at = Date.parse(row.asserted_at);
    if (!Number.isFinite(at) || at >= headStartedAt) continue;
    if (row.source === "verified") return "verified";
    owner = true;
  }
  if (owner) return "owner_asserted";
  return exportedBeforeHead ? "exported" : null;
}

export interface RecordApplicationInput {
  workspaceId: string;
  actionId: string;
  source: ApplicationSource;
  outputVersionId?: string | null;
  assertedBy?: string | null;
  note?: string | null;
  evidence?: Record<string, unknown> | null;
}

/**
 * THE VERIFIER SEAM. A future provider verifier calls this with
 * `source: 'verified'` and its proof in `evidence`; nothing calls it that way
 * today. It is deliberately a function rather than a route: exposing
 * verification over HTTP is a separate, unauthorized decision, and an empty
 * second table would have been schema built for a feature that does not exist.
 */
export async function recordApplication(
  repo: ApplicationRepository,
  input: RecordApplicationInput,
): Promise<{ id: string } | null> {
  return repo.insert({
    workspace_id: input.workspaceId,
    action_id: input.actionId,
    output_version_id: input.outputVersionId ?? null,
    source: input.source,
    asserted_by: input.assertedBy ?? null,
    note: input.note ?? null,
    evidence: input.evidence ?? null,
  });
}
