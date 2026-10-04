import { z } from "zod";
import { json, readJson } from "@/app/api/actions/_shared/mutation";
import { findLocationForPlace, reviewNameIsUnder, type GbpLocationRef } from "@/lib/oauth/google-reviews";
import { withGbpAccessToken } from "@/lib/publishing/connection";
import { consumePublishLimits } from "@/lib/publishing/limits";
import { runPublish, type RunPublishResult } from "@/lib/publishing/run-publish";
import { readPublishUsage } from "@/lib/publishing/route-support";
import { PublishError } from "@/lib/repositories/publishing";
import { sendDeliveryNotices } from "@/lib/workspace/delivery-notices";
import type { Usage } from "@/lib/workspace/usage";
import { googleFailureResponse, guardPublishRequest, limitRefusal, unavailable } from "./guard";

/**
 * POST /api/versions/[versionId]/publish { reviewName, idempotencyKey, confirmVersionNo }
 * (P4.6 spec §3.2) → 200 { deliveryId, state: 'published'|'failed'|'publishing', counted, reason?, usage }.
 * `publishing` means uncertain: the one PUT may or may not have landed, and
 * only reconcile settles it.
 *
 * Refused before any delivery exists: 400 bad body | 404 not_enabled (flag
 * off, before any SQL) | 409 <eligibility reason> | 409 version_changed |
 * 409 location_not_managed | 409 connection_missing|connection_expired |
 * 403 target_not_in_location | 429 (Retry-After) | 502 <reason code> | 503.
 * `begin` refusals are 409 with the PublishError code.
 *
 * Counting happens only in SQL (`finish`, once per version, DEC-14). A new
 * counted publish sends the export route's in-app notices.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const LOG = "api/versions/publish";

const bodySchema = z.object({
  reviewName: z.string().min(1).max(512),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  confirmVersionNo: z.number().int(),
});

type UsageJson = { period: string; approved_deliveries: number; allowance: number | null };

export async function POST(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const guard = await guardPublishRequest(versionId, LOG);
  if (!guard.ok) return guard.response;
  const { subject, repository, user } = guard;

  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_body" }, 400);
  const { reviewName, idempotencyKey, confirmVersionNo } = parsed.data;

  // The client proves it confirmed this exact version; checked before Google is called.
  if (confirmVersionNo !== subject.versionNo) return json({ error: "version_changed" }, 409);

  // Spent before the location lookup (several Google calls), so a refused caller calls Google not at all.
  const refused = limitRefusal(await consumePublishLimits("publish", { workspaceId: subject.workspaceId }));
  if (refused) return refused;

  let location: GbpLocationRef | null;
  try {
    location = await withGbpAccessToken(subject.workspaceId, (token) => findLocationForPlace(token, subject.placeId));
  } catch (error) {
    return googleFailureResponse(error, LOG, versionId);
  }
  if (!location) return json({ error: "location_not_managed" }, 409);
  if (!reviewNameIsUnder(reviewName, location)) return json({ error: "target_not_in_location" }, 403);

  let begun: Awaited<ReturnType<typeof repository.begin>>;
  try {
    begun = await repository.begin({ versionId, actorId: user.id, targetRef: reviewName, idempotencyKey });
  } catch (error) {
    if (error instanceof PublishError) return json({ error: error.code }, 409);
    return unavailable(LOG, versionId);
  }

  let result: RunPublishResult;
  if (begun.kind === "existing") {
    // Same key, same answer: report the delivery as it stands, send nothing to Google.
    let existing: Awaited<ReturnType<typeof repository.getDelivery>>;
    try {
      existing = await repository.getDelivery(begun.deliveryId);
    } catch {
      return unavailable(LOG, versionId);
    }
    // The key is global; one naming another version's delivery reveals nothing.
    if (!existing || existing.workspaceId !== subject.workspaceId || existing.versionId !== versionId) {
      return json({ error: "idempotency_key_conflict" }, 409);
    }
    result = {
      state: existing.state,
      counted: existing.counted,
      ...(existing.failureReason ? { reason: existing.failureReason as NonNullable<RunPublishResult["reason"]> } : {}),
    };
  } else {
    result = await runPublish({
      workspaceId: subject.workspaceId,
      deliveryId: begun.deliveryId,
      actorId: user.id,
      reviewName,
      body: subject.body,
    });
  }

  const usage = await readPublishUsage(LOG, subject.workspaceId);
  if (begun.kind === "begun" && result.counted && usage) {
    await sendDeliveryNotices({ workspaceId: subject.workspaceId, actionId: subject.actionId, kind: "publish", usage });
  }

  return json({
    deliveryId: begun.deliveryId,
    state: result.state,
    counted: result.counted,
    ...(result.reason ? { reason: result.reason } : {}),
    usage: usage ? usageJson(usage) : null,
  });
}

function usageJson(usage: Usage): UsageJson {
  return { period: usage.period, approved_deliveries: usage.approvedDeliveries, allowance: usage.allowance };
}
