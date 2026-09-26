import "server-only";
import { getMarketCtas, type Market } from "@sme-scanner/region";
import { OWNER_FAILURE_KINDS, type OwnerProblem } from "@/lib/ops/failure-types";
import { buildOwnerProblems } from "@/lib/ops/owner-actions";
import { failuresRepository, type FailureQuery } from "@/lib/repositories/failures";
import type { FailureItem } from "@/lib/ops/failure-types";
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace";

export interface ProblemsInput {
  workspaceId: string;
  market: Market;
  membership: { role: WorkspaceRole; locationScope: string[] | null };
  tier: "lite" | "paid";
}

export interface ProblemsDeps {
  list: (query: FailureQuery) => Promise<FailureItem[]>;
  contactHref: (market: Market) => string | null;
}

const defaults: ProblemsDeps = {
  list: (query) => failuresRepository().list(query),
  contactHref: (market) => getMarketCtas(market)[0]?.href ?? null,
};

/**
 * Owner-side problems (P3.5b spec §1, §4). Null means "could not be read":
 * the page then renders without the card or section rather than claiming
 * there are no problems.
 */
export async function loadWorkspaceProblems(input: ProblemsInput, deps: ProblemsDeps = defaults): Promise<OwnerProblem[] | null> {
  try {
    const items = await deps.list({ kinds: OWNER_FAILURE_KINDS, hexPrefix: null, uuid: null, workspaceId: input.workspaceId, limit: 50 });
    return buildOwnerProblems(items, { ...input.membership, tier: input.tier }, deps.contactHref(input.market));
  } catch {
    console.error("[ops] problems_unavailable", { category: "ops_problems_unavailable" });
    return null;
  }
}
