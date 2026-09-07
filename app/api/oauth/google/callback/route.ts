import { NextResponse } from "next/server";
import { claimsRepository, recordClaimAuditEvent } from "@/lib/repositories/claims";
import { getUser } from "@/lib/auth";
import { membershipRepository } from "@/lib/repositories/membership";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";
import { exchangeCode, GBP_SCOPE_REQUIRED, verifyState } from "@/lib/oauth/google-connection";
import { encryptToken } from "@/lib/security/token-crypto";

const WORKSPACE_SLUG_RE = /^[a-z0-9-]{1,64}$/;

/**
 * Return the owner to their integrations page with the outcome attached.
 *
 * Upstream lands on the unprefixed `/owner` dashboard. Every route in this
 * app is `/{locale}/owner/<workspaceSlug>/…`, so the callback loads the slug
 * of the workspace it connected and lands on that workspace's
 * settings/integrations page, which renders ok / not-ok from `connected`.
 * When no workspace is known yet (declined before the state was read, a
 * state that did not verify, no session) it falls back to the workspace
 * picker, which is the only owner page that needs no slug.
 */
function back(origin: string, locale: Locale, workspaceSlug: string | null, params: Record<string, string>): NextResponse {
  const target =
    workspaceSlug && WORKSPACE_SLUG_RE.test(workspaceSlug)
      ? `/${locale}/owner/${workspaceSlug}/settings/integrations`
      : `/${locale}/owner/select-workspace`;
  const url = new URL(target, origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

/**
 * Best-effort slug lookup for the outcomes that happen before the main
 * workspace read (a declined consent still echoes the signed state, so the
 * merchant can be sent back to the page they started from). Never throws:
 * a failed lookup only costs the nicer redirect target.
 */
async function workspaceSlugFor(workspaceId: string): Promise<string | null> {
  try {
    const data = await membershipRepository.workspace({id:workspaceId});
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

  // Parsed before the error/code checks so a declined return trip still
  // recovers the locale (and workspace) from the echoed `state` -- Google
  // returns the original `state` on an error redirect too, not only on success.
  const payload = state ? verifyState(state) : null;
  const locale: Locale = isLocale(payload?.locale) ? payload.locale : DEFAULT_LOCALE;

  // Declining consent is an ordinary outcome, not a failure.
  if (requestUrl.searchParams.get("error")) {
    const slug = payload ? await workspaceSlugFor(payload.workspaceId) : null;
    return back(origin, locale, slug, { connected: "declined" });
  }
  if (!code || !state) return back(origin, locale, null, { connected: "invalid" });

  if (!payload) return back(origin, locale, null, { connected: "invalid_state" });

  try {
    const user = await getUser();
    if (!user?.id || !user.verified) return back(origin, locale, null, { connected: "unauthenticated" });

    const workspace = await membershipRepository.workspace({id:payload.workspaceId});
    if (!workspace) return back(origin, locale, null, { connected: "forbidden" });
    const workspaceSlug: string | null = typeof workspace.slug === "string" ? workspace.slug : null;

    const membership = await membershipRepository.accepted(user.id,payload.workspaceId);
    // The signature proves the state is ours; it does not prove the person
    // returning still has access. A viewer must not be able to complete a
    // consent flow they were never allowed to start.
    if (!membership || membership.role === "viewer") {
      // Not the workspace's slug: a caller who is not a member must not be
      // redirected into that workspace's pages.
      return back(origin, locale, null, { connected: "forbidden" });
    }

    const tokens = await exchangeCode(code);
    if (!tokens) return back(origin, locale, workspaceSlug, { connected: "exchange_failed" });

    // A repeat consent without a refresh token would silently downgrade the
    // connection to single-use, so it is refused rather than stored.
    if (!tokens.refreshToken) {
      console.error("[google-oauth] consent returned no refresh token");
      return back(origin, locale, workspaceSlug, { connected: "no_refresh_token" });
    }

    // Google's granular consent lets the user deselect business.manage and still
    // return a valid code. Storing that as active would report a healthy
    // connection whose every API call 403s, and the partial unique index would
    // then block a corrective reconnect until someone flipped the row by hand.
    if (!tokens.scopes.includes(GBP_SCOPE_REQUIRED)) {
      console.error("[google-oauth] consent omitted the business.manage scope");
      return back(origin, locale, workspaceSlug, { connected: "missing_scope" });
    }

    // Encrypt BEFORE touching the existing row: encryptToken throws in
    // production on a missing or short key, and doing it after the revoke would
    // leave a merchant with a revoked connection and no replacement.
    const encrypted = {
      access_token_encrypted: encryptToken(tokens.accessToken),
      refresh_token_encrypted: encryptToken(tokens.refreshToken),
    };

    let connectionId: string;
    try {
      connectionId = await claimsRepository.replaceGoogleConnection({
        workspaceId:workspace.id, accessTokenEncrypted:encrypted.access_token_encrypted,
        refreshTokenEncrypted:encrypted.refresh_token_encrypted, scopes:tokens.scopes, expiresAt:tokens.expiresAt,
      });
    } catch {
      console.error("Google OAuth connection storage failed");
      return back(origin,locale,workspaceSlug,{connected:"storage_failed"});
    }

    // Best-effort audit trail (CLAUDE.md §3.11 `integration.updated`). The
    // connection is already active; a failed log write must not surface as a
    // failed connection.
    await recordClaimAuditEvent({
      workspace_id: workspace.id,
      actor_type: "user",
      actor_id: user.id,
      event: "integration.updated",
      entity_type: "oauth_connection",
      entity_id: connectionId,
      payload: { locale, provider: "google_gbp" },
    });

    return back(origin, locale, workspaceSlug, { connected: "ok" });
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return back(origin, locale, null, { connected: "unavailable" });
  }
}
