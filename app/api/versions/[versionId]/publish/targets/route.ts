import { json } from "@/app/api/actions/_shared/mutation";
import { findLocationForPlace, listUnrepliedReviews, type GbpReviewTarget } from "@/lib/oauth/google-reviews";
import { withGbpAccessToken } from "@/lib/publishing/connection";
import { consumePublishLimits } from "@/lib/publishing/limits";
import { preselectTarget } from "@/lib/publishing/preselect";
import { googleFailureResponse, guardPublishRequest, limitRefusal } from "../guard";

/**
 * GET /api/versions/[versionId]/publish/targets (P4.6 spec §3.1)
 * → 200 { targets: GbpReviewTarget[], preselected: reviewName | null }
 * | 404 not_enabled (flag off, before any SQL) | 409 <eligibility reason> |
 * 409 location_not_managed | 409 connection_missing|connection_expired |
 * 429 (Retry-After) | 502 <reason code> | 503.
 *
 * Owner, or manager in the action's location. Read-only: nothing is stored or
 * logged but a category.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const LOG = "api/versions/publish/targets";

export async function GET(_req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const guard = await guardPublishRequest(versionId, LOG);
  if (!guard.ok) return guard.response;
  const { subject, repository } = guard;

  const refused = limitRefusal(await consumePublishLimits("targets", { workspaceId: subject.workspaceId }));
  if (refused) return refused;

  let targets: GbpReviewTarget[] | null;
  try {
    targets = await withGbpAccessToken(subject.workspaceId, async (token) => {
      const location = await findLocationForPlace(token, subject.placeId);
      return location ? listUnrepliedReviews(token, location) : null;
    });
  } catch (error) {
    return googleFailureResponse(error, LOG, versionId);
  }
  if (targets === null) return json({ error: "location_not_managed" }, 409);

  const preselected = preselectTarget(targets, await repository.candidateReviewTexts(versionId));
  return json({ targets, preselected });
}
