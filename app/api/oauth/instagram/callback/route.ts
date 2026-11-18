import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";
import { exchangeInstagramCode, verifyInstagramState } from "@/lib/oauth/instagram-connection";
import { recordClaimAuditEvent } from "@/lib/repositories/claims";
import { instagramConnectionRepository } from "@/lib/repositories/instagram-connection";
import { instagramInsightsRepository } from "@/lib/repositories/instagram-insights";
import { membershipRepository } from "@/lib/repositories/membership";
import { encryptToken } from "@/lib/security/token-crypto";

/**
 * Finishes the Instagram (Meta Graph) consent flow.
 *
 * Every outcome lands on the workspace's Business -> Instagram and Google page
 * with a content-free `?instagram=<code>`; the page renders the friendly copy.
 * No provider text, code or token is ever placed in the redirect.
 *
 * The state signature proves the request is ours; it does not prove the person
 * returning still owns the workspace, so membership is re-checked here (owner
 * only) exactly as the start route and the callback it mirrors do. A role
 * demoted between start and callback must not be able to install a credential.
 */
const WORKSPACE_SLUG_RE = /^[a-z0-9-]{1,64}$/;

function back(origin: string, locale: Locale, workspaceSlug: string | null, outcome: string): NextResponse {
  const target =
    workspaceSlug && WORKSPACE_SLUG_RE.test(workspaceSlug)
      ? `/${locale}/owner/${workspaceSlug}/business/integrations`
      : `/${locale}/owner/select-workspace`;
  const url = new URL(target, origin);
  url.searchParams.set("instagram", outcome);
  return NextResponse.redirect(url);
}

/** Best-effort slug lookup for outcomes that happen before the workspace read. */
async function workspaceSlugFor(workspaceId: string): Promise<string | null> {
  try {
    const data = await membershipRepository.workspace({ id: workspaceId });
    return typeof data?.slug === "string" ? data.slug : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");

  // Parsed before the error/code checks: Meta echoes `state` on a declined
  // return too, so the locale (and workspace) can still be recovered.
  const payload = state ? verifyInstagramState(state) : null;
  const locale: Locale = isLocale(payload?.locale) ? payload.locale : DEFAULT_LOCALE;

  // Declining is an ordinary outcome, not a failure.
  if (requestUrl.searchParams.get("error")) {
    const slug = payload ? await workspaceSlugFor(payload.workspaceId) : null;
    return back(origin, locale, slug, "declined");
  }
  if (!code || !state) return back(origin, locale, null, "invalid");
  if (!payload) return back(origin, locale, null, "invalid_state");

  try {
    const user = await getUser();
    if (!user?.id || !user.verified) return back(origin, locale, null, "unauthenticated");

    const workspace = await membershipRepository.workspace({ id: payload.workspaceId });
    if (!workspace) return back(origin, locale, null, "forbidden");
    const workspaceSlug: string | null = typeof workspace.slug === "string" ? workspace.slug : null;

    const membership = await membershipRepository.accepted(user.id, payload.workspaceId);
    if (!membership || membership.role !== "owner") {
      // Never echo another workspace's slug to a non-member.
      return back(origin, locale, null, "forbidden");
    }

    const result = await exchangeInstagramCode(code);
    if (!result.ok) return back(origin, locale, workspaceSlug, result.reason);

    // Encrypt before touching the existing row: encryptToken throws in
    // production on a missing or short key, and doing it after the revoke would
    // leave the workspace with a revoked connection and no replacement.
    let connectionId: string;
    try {
      connectionId = await instagramConnectionRepository().replaceConnection({
        workspaceId: workspace.id,
        accountRef: JSON.stringify(result.account),
        accessTokenEncrypted: encryptToken(result.tokens.accessToken),
        scopes: result.tokens.scopes,
        expiresAt: result.tokens.expiresAt,
      });
    } catch {
      console.error("Instagram OAuth connection storage failed");
      return back(origin, locale, workspaceSlug, "storage_failed");
    }

    // A new authorization may name a different account: drop any observations
    // from the previous credential so the Results page never mixes two
    // accounts' numbers. Best-effort; the connection is already active.
    let insightsReset = 0;
    try {
      insightsReset = await instagramInsightsRepository().deleteWorkspace(workspace.id);
    } catch {
      console.error("Instagram insights reset failed", { category: "instagram_insights_reset_failed" });
    }

    // Best-effort audit trail (guardrail 10). The connection is already active;
    // a failed log write must not surface as a failed connection.
    try {
      await recordClaimAuditEvent({
        workspace_id: workspace.id,
        actor_type: "user",
        actor_id: user.id,
        event: "integration.updated",
        entity_type: "oauth_connection",
        entity_id: connectionId,
        payload: { locale, provider: "instagram", status: "connected", insights_reset: insightsReset },
      });
    } catch {
      console.error("Instagram OAuth audit event not recorded");
    }

    return back(origin, locale, workspaceSlug, "ok");
  } catch (error) {
    console.error("Instagram OAuth callback failed", error);
    return back(origin, locale, null, "unavailable");
  }
}
