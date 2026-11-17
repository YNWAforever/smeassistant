import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import {
  buildInstagramConsentUrl,
  instagramOAuthConfigured,
  instagramOAuthEnabled,
  signInstagramState,
} from "@/lib/oauth/instagram-connection";
import { membershipRepository } from "@/lib/repositories/membership";
import { authorizeWorkspace } from "@/lib/workspace/authorize-workspace";

/**
 * Begins the Instagram (Meta Graph) consent flow for the signed-in owner's
 * workspace. P20.1 scope: this only connects an account; nothing publishes and
 * no insight is read.
 *
 * The workspace comes from the session, never from the request: a workspace id
 * in the query would let a signed-in user bind their Instagram account to
 * someone else's workspace. `?workspace=<slug>` is only a selector and the
 * membership lookup is filtered by the session user.
 *
 * Failure order is deliberate: the flag first (404 `not_enabled`, matching the
 * other feature-gated routes), then configuration (503 `unavailable`, so a
 * half-configured deploy never sends the owner to Meta), then the session and
 * the owner check.
 */
const WORKSPACE_SLUG_RE = /^[a-z0-9-]{1,64}$/;

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;

  if (!instagramOAuthEnabled()) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 });
  }
  if (!instagramOAuthConfigured()) {
    console.error("Instagram OAuth is not configured");
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
      const workspace = await membershipRepository.workspace({ slug: workspaceSlug });
      if (!workspace) return NextResponse.json({ error: "no_workspace" }, { status: 403 });
      membership = await membershipRepository.accepted(user.id, workspace.id);
    } else {
      membership = (await membershipRepository.listAccepted(user.id))[0] ?? null;
    }

    const access = authorizeWorkspace({
      membership: membership ? { workspaceId: membership.workspace_id, role: membership.role } : null,
      sessionUser: { id: user.id, email: user.email ?? null },
    });
    // Owner only, matching the integrations page and the other connection
    // routes: connecting replaces whatever credential the workspace holds, so a
    // manager must not be able to install their own account over the owner's.
    if (access.kind !== "member" || access.role !== "owner") {
      return NextResponse.json({ error: "no_workspace" }, { status: 403 });
    }

    const state = signInstagramState(access.workspaceId, undefined, locale);
    return NextResponse.redirect(new URL(buildInstagramConsentUrl(state), origin).toString());
  } catch (error) {
    console.error("Instagram OAuth start failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
