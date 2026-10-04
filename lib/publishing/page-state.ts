import "server-only";

import { GBP_SCOPE_REQUIRED } from "@/lib/oauth/google-connection";
import { publishEligibility, type EligibilityReason } from "@/lib/publishing/eligibility";
import { gbpReplyPublishEnabled } from "@/lib/publishing/flag";
import { publishingRepository, type PublishState } from "@/lib/repositories/publishing";
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace";

/**
 * What the action detail page's Google publish card needs (P4.6 spec §4): the
 * flag, the eligibility of the latest approved version, the UI mirror of the
 * authority rule, and the publish deliveries of this action's versions.
 *
 * Plain data only. No token, no review text, no reply body and no Google
 * response reaches it: a delivery is its id, version, state, reason code and
 * two timestamps. `connectionActive` drives the capability badge.
 *
 * The UI mirrors the server; the routes stay the authority.
 */
export type PublishPanelDelivery = {
  id: string;
  versionId: string;
  state: PublishState;
  reason: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

export type PublishPanel = {
  enabled: boolean;
  connectionActive: boolean;
  eligibility: { ok: true } | { ok: false; reason: EligibilityReason };
  canPublish: boolean;
  canDelete: boolean;
  deliveries: PublishPanelDelivery[];
};

const REVIEW_RESPONSE = "review-response";

/**
 * Null for any template but `review-response`, and null (the card hides) when a
 * read fails: the page never fails because of this card.
 *
 * Safe before migration 0014 with the flag off: `publishDeliveryIds` reads
 * only 0002 columns and runs always; the 0014 columns are read through
 * `getDelivery` only for publish rows it found (none can exist without 0014);
 * the connection is read only when the flag is on.
 *
 * `versions` are newest first (as `getAction` returns them); eligibility is
 * judged on the newest approved one, and with none it is `not_approved`.
 */
export async function loadPublishPanel(input: {
  workspaceId: string;
  templateKey: string;
  locationPlaceId: string | null;
  role: WorkspaceRole;
  inScope: boolean;
  versions: Array<{ id: string; approval_state: string; body: string }>;
  enabled?: boolean;
}): Promise<PublishPanel | null> {
  if (input.templateKey !== REVIEW_RESPONSE) return null;
  const enabled = input.enabled ?? gbpReplyPublishEnabled();

  try {
    const repository = publishingRepository();
    const rows = await repository.publishDeliveryIds(
      input.workspaceId,
      input.versions.map((version) => version.id),
    );
    const found = await Promise.all(rows.map((row) => repository.getDelivery(row.id)));
    const deliveries: PublishPanelDelivery[] = [];
    for (const delivery of found) {
      if (!delivery || delivery.workspaceId !== input.workspaceId) continue;
      deliveries.push({
        id: delivery.id,
        versionId: delivery.versionId,
        state: delivery.state,
        reason: delivery.failureReason,
        verifiedAt: delivery.verifiedAt,
        createdAt: delivery.createdAt,
      });
    }

    let connectionActive = false;
    if (enabled) {
      const connection = await repository.activeGbpConnection(input.workspaceId);
      connectionActive = connection !== null && connection.scopes.includes(GBP_SCOPE_REQUIRED);
    }

    const approved = input.versions.find((version) => version.approval_state === "approved") ?? null;
    const eligibility = publishEligibility({
      enabled,
      templateKey: input.templateKey,
      approvalState: approved?.approval_state ?? "none",
      placeId: input.locationPlaceId,
      connectionActive,
      body: approved?.body ?? "",
    });
    const mayAct = input.role !== "viewer" && (input.role === "owner" || input.inScope);

    return {
      enabled,
      connectionActive,
      eligibility,
      canPublish: enabled && eligibility.ok && mayAct,
      canDelete: enabled && input.role === "owner",
      deliveries,
    };
  } catch {
    console.error("[owner/actions] publish panel unavailable", { category: "gbp_publish_panel_unavailable" });
    return null;
  }
}
