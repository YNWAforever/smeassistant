import "server-only";

import { GBP_SCOPE_REQUIRED } from "@/lib/oauth/google-connection";
import { publishEligibility, type EligibilityReason } from "@/lib/publishing/eligibility";
import { gbpReplyPublishEnabled, instagramPublishEnabled } from "@/lib/publishing/flag";
import { INSTAGRAM_PUBLISH_SCOPES } from "@/lib/publishing/instagram-connection";
import { INSTAGRAM_PUBLISHABLE_TEMPLATES } from "@/lib/publishing/instagram-eligibility";
import { publishingRepository, type PublishState } from "@/lib/repositories/publishing";
import { instagramConnectionRepository, parseInstagramAccountRef } from "@/lib/repositories/instagram-connection";
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
  /**
   * The role half of `canPublish` (owner, or manager in scope), with the flag
   * on: whether a blocked reason is this member's to fix, or read-only copy.
   */
  mayAct: boolean;
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
      mayAct: enabled && mayAct,
      canPublish: enabled && eligibility.ok && mayAct,
      canDelete: enabled && input.role === "owner",
      deliveries,
    };
  } catch {
    console.error("[owner/actions] publish panel unavailable", { category: "gbp_publish_panel_unavailable" });
    return null;
  }
}

export type InstagramPublishPanelDelivery = {
  id: string;
  versionId: string;
  state: PublishState;
  reason: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

export type InstagramPublishPanel = {
  enabled: boolean;
  connectionActive: boolean;
  templateAllowed: boolean;
  /** The role/scope half of `canPublish`; false makes a blocked reason read-only copy. */
  mayAct: boolean;
  canPublish: boolean;
  deliveries: InstagramPublishPanelDelivery[];
};

/**
 * P20.2c: what the action detail page's Instagram publish card needs. Plain
 * data only, mirroring `loadPublishPanel` for the second channel:
 *
 * - null for any template that is not a feed post (`social-post`,
 *   `offer-instagram-post`), unless an Instagram delivery already exists for
 *   one of this action's versions (a receipt stays visible across a template
 *   change and can still be reconciled);
 * - null when the flag is off and no delivery exists, so the card never appears
 *   on a database without migration 0023;
 * - `connectionActive` needs an active Instagram connection that names an
 *   account and carries both publish scopes; it drives the capability copy. No
 *   token, account id or username reaches the panel.
 *
 * The card additionally requires the selected version to be approved
 * (`approved` prop); the route re-checks everything, including the image URL
 * the owner types later, so this panel cannot make a version publishable.
 */
export async function loadInstagramPublishPanel(input: {
  workspaceId: string;
  templateKey: string;
  role: WorkspaceRole;
  inScope: boolean;
  versions: Array<{ id: string }>;
  enabled?: boolean;
}): Promise<InstagramPublishPanel | null> {
  const enabled = input.enabled ?? instagramPublishEnabled();
  const templateAllowed = INSTAGRAM_PUBLISHABLE_TEMPLATES.includes(input.templateKey);
  // Nothing to show and nothing to read: another template on a database without 0023.
  if (!templateAllowed && !enabled) return null;

  try {
    const repository = publishingRepository();
    const rows = await repository.publishDeliveryIds(
      input.workspaceId,
      input.versions.map((version) => version.id),
    );
    const found = await Promise.all(rows.map((row) => repository.getDelivery(row.id)));
    const deliveries: InstagramPublishPanelDelivery[] = [];
    for (const delivery of found) {
      if (!delivery || delivery.workspaceId !== input.workspaceId || delivery.channel !== "instagram") continue;
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
      const connection = await instagramConnectionRepository().activeConnection(input.workspaceId);
      connectionActive = connection !== null
        && parseInstagramAccountRef(connection.accountRef) !== null
        && INSTAGRAM_PUBLISH_SCOPES.every((scope) => connection.scopes.includes(scope));
    }

    if (!templateAllowed && deliveries.length === 0) return null;
    if (!enabled && deliveries.length === 0) return null;

    const mayAct = input.role !== "viewer" && (input.role === "owner" || input.inScope);
    return {
      enabled,
      connectionActive,
      templateAllowed,
      mayAct,
      canPublish: enabled && templateAllowed && connectionActive && mayAct,
      deliveries,
    };
  } catch {
    console.error("[owner/actions] instagram publish panel unavailable", { category: "instagram_publish_panel_unavailable" });
    return null;
  }
}
