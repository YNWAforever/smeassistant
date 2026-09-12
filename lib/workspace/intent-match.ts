import "server-only";
import { OPEN_ACTION_STATES } from "@/lib/domain";
import { workspaceReadRepository } from "@/lib/repositories/workspace-read";

/**
 * P2.5 item 8: after claim, find the open action matching the intent the
 * visitor picked on a landing-page outcome-example link, so onboarding can
 * route straight to it instead of the generic workspace home.
 *
 * Null whenever there is nothing to match -- no intent was recorded on the
 * job's input_snapshot, or the scan did not actually produce a finding that
 * template addresses (the promised outcome does not apply to this business,
 * which is a legitimate, honest result -- guardrail 2, "unavailable is not
 * zero" -- not an error to surface).
 */
export async function findMatchedIntentAction(
  workspaceId: string,
  locationId: string,
  intent: unknown,
): Promise<string | null> {
  if (typeof intent !== "string" || !intent) return null;
  const actions = await workspaceReadRepository().actions(workspaceId, {
    locationId,
    states: [...OPEN_ACTION_STATES],
  });
  return actions.find((row) => row.template_key === intent)?.id ?? null;
}
