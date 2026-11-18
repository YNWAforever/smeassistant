import { z } from "zod";

import { json, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { instagramPublishEligibility } from "@/lib/publishing/instagram-eligibility";
import { consumeInstagramPublishLimits } from "@/lib/publishing/instagram-limits";
import { INSTAGRAM_PUBLISH_SCOPES } from "@/lib/publishing/instagram-connection";
import { runInstagramPublish, type RunInstagramPublishResult } from "@/lib/publishing/instagram-run-publish";
import { limitRefusal, readPublishUsage, unavailableResponse } from "@/lib/publishing/route-support";
import { instagramPublishEnabled } from "@/lib/publishing/flag";
import { PublishError, publishingRepository, type PublishSubject } from "@/lib/repositories/publishing";
import { instagramConnectionRepository, parseInstagramAccountRef } from "@/lib/repositories/instagram-connection";
import { sendDeliveryNotices } from "@/lib/workspace/delivery-notices";
import type { Usage } from "@/lib/workspace/usage";

/**
 * POST /api/versions/[versionId]/publish-instagram
 * body { imageUrl, idempotencyKey, confirmVersionNo }
 * → 200 { deliveryId, state: 'published'|'failed'|'publishing', counted, reason?, usage }.
 * `publishing` means uncertain: the one media_publish may or may not have
 * landed, and only the reconcile route settles it.
 *
 * Refused before any delivery exists: 400 bad body | 404 not_enabled (flag
 * off, before any SQL) | 404 not_found | 409 <eligibility reason> |
 * 409 version_changed | 409 connection_missing | 429 (Retry-After) | 503.
 * `begin` refusals are 409 with the PublishError code.
 *
 * Owner or manager in the action's location (the export rule). A version
 * counts at most once (DEC-14); counting happens only in SQL (`finish`).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const LOG = "api/versions/publish-instagram";

const bodySchema = z.object({
  imageUrl: z.string().min(1).max(2048),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  confirmVersionNo: z.number().int(),
});

type UsageJson = { period: string; approved_deliveries: number; allowance: number | null };

export async function POST(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  if (!UUID_RE.test(versionId)) return json({ error: "versionId is invalid" }, 400);
  if (!instagramPublishEnabled()) return json({ error: "not_enabled" }, 404);

  const repository = publishingRepository();
  let subject: PublishSubject | null;
  try {
    subject = await repository.publishSubject(versionId);
  } catch {
    return unavailableResponse(LOG, { versionId });
  }
  if (!subject) return json({ error: "not_found" }, 404);

  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_body" }, 400);
  const { imageUrl, idempotencyKey, confirmVersionNo } = parsed.data;

  // The client proves it confirmed this exact version; checked before Meta is called.
  if (confirmVersionNo !== subject.versionNo) return json({ error: "version_changed" }, 409);

  const auth = await authorizeWorkspaceRequest(
    { id: subject.workspaceId },
    { minRole: "manager", locationId: subject.locationId ?? undefined },
  );
  if (!auth.ok) return json({ error: auth.code }, auth.status);

  let account: { id: string } | null;
  try {
    const connection = await instagramConnectionRepository().activeConnection(subject.workspaceId);
    const parsedAccount = parseInstagramAccountRef(connection?.accountRef ?? null);
    account =
      connection && parsedAccount && INSTAGRAM_PUBLISH_SCOPES.every((scope) => connection.scopes.includes(scope))
        ? parsedAccount
        : null;
  } catch {
    return unavailableResponse(LOG, { versionId });
  }
  if (!account) return json({ error: "connection_missing" }, 409);

  const eligibility = instagramPublishEligibility({
    enabled: true,
    templateKey: subject.templateKey,
    approvalState: subject.approvalState,
    caption: subject.body,
    imageUrl,
  });
  if (!eligibility.ok) return json({ error: eligibility.reason }, 409);

  const refused = limitRefusal(await consumeInstagramPublishLimits("publish", { workspaceId: subject.workspaceId }));
  if (refused) return refused;

  let begun: Awaited<ReturnType<typeof repository.beginInstagram>>;
  try {
    begun = await repository.beginInstagram({
      versionId,
      actorId: auth.user.id,
      targetRef: account.id,
      idempotencyKey,
      imageUrl,
      caption: subject.body,
    });
  } catch (error) {
    if (error instanceof PublishError) return json({ error: error.code }, 409);
    return unavailableResponse(LOG, { versionId });
  }

  let result: RunInstagramPublishResult;
  if (begun.kind === "existing") {
    // Same key, same answer: report the delivery as it stands, call nothing.
    let existing: Awaited<ReturnType<typeof repository.getDelivery>>;
    try {
      existing = await repository.getDelivery(begun.deliveryId);
    } catch {
      return unavailableResponse(LOG, { versionId });
    }
    // The key is global; one naming another version's delivery reveals nothing.
    if (!existing || existing.workspaceId !== subject.workspaceId || existing.versionId !== versionId) {
      return json({ error: "idempotency_key_conflict" }, 409);
    }
    result = {
      state: existing.state,
      counted: existing.counted,
      ...(existing.failureReason ? { reason: existing.failureReason as NonNullable<RunInstagramPublishResult["reason"]> } : {}),
    };
  } else {
    result = await runInstagramPublish({
      workspaceId: subject.workspaceId,
      deliveryId: begun.deliveryId,
      actorId: auth.user.id,
      imageUrl,
      caption: subject.body,
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
