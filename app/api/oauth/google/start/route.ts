import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { membershipRepository } from "@/lib/repositories/membership";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { buildConsentUrl, googleOAuthConfigured, signState } from "@/lib/oauth/google-connection";
import { authorizeWorkspace } from "@/lib/workspace/authorize-workspace";

/**
 * Begins the GBP consent flow for the signed-in owner's workspace.
 *
 * The workspace is resolved from the session rather than accepted as a
 * parameter: a workspace id in the request body would let any signed-in user
 * start a flow that binds their Google account to someone else's workspace.
 *
 * smeassistant additions (every owner route here is `/{locale}/owner/<slug>/…`,
 * and one person may belong to several workspaces):
 * - `?locale=` is carried through the signed state so the callback can land
 *   on the right locale; anything that is not a supported locale falls back
 *   to DEFAULT_LOCALE.
 * - `?workspace=<slug>` names which of the caller's workspaces to connect. It
 *   is still only a *selector*: the membership lookup below is filtered by the
 *   session's own user id, so naming someone else's workspace resolves to no
 *   membership and 403s exactly like having none. Without it, upstream's
 *   oldest-membership rule applies unchanged.
 */
const WORKSPACE_SLUG_RE = /^[a-z0-9-]{1,64}$/;

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;

  if (!googleOAuthConfigured()) {
    console.error("Google OAuth is not configured");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const requestedLocale = requestUrl.searchParams.get("locale");
  const locale = isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  const workspaceSlug = requestUrl.searchParams.get("workspace");
  if (workspaceSlug !== null && !WORKSPACE_SLUG_RE.test(workspaceSlug)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const user = await getUser();
    if (!user?.id || !user.verified) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    let membership;
    if (workspaceSlug) {
      const workspace = await membershipRepository.workspace({slug:workspaceSlug});
      if (!workspace) return NextResponse.json({error:"no_workspace"},{status:403});
      membership = await membershipRepository.accepted(user.id,workspace.id);
    } else {
      membership = (await membershipRepository.listAccepted(user.id))[0] ?? null;
    }

    const access = authorizeWorkspace({
      membership: membership ? { workspaceId: membership.workspace_id, role: membership.role } : null,
      sessionUser: { id: user.id, email: user.email ?? null },
    });
    // Staff must not be able to bind their own Google account to a merchant's
    // workspace, so this is member-only rather than "not none".
    //
    // Owner only, not owner-or-manager: integrations are an owner setting
    // (CLAUDE.md §3.9, "Brand, integrations, team, billing settings | owner ✓ |
    // manager ✗"). Connecting is not an additive act -- the callback's
    // `replaceGoogleConnection` REVOKES whatever credential the workspace
    // already holds and installs the consenting account's tokens in its place.
    // Admitting managers let an invited contractor silently replace the
    // owner's Google credential with their own, while the owner-only
    // disconnect route meant the owner could remove it but a manager could not.
    if (access.kind !== "member" || access.role !== "owner") {
      return NextResponse.json({ error: "no_workspace" }, { status: 403 });
    }

    return NextResponse.redirect(
      new URL(buildConsentUrl(signState(access.workspaceId, undefined, locale)), origin).toString(),
    );
  } catch (error) {
    console.error("Google OAuth start failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
