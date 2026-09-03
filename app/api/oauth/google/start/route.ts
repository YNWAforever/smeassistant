import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseServer } from "@/lib/supabase/admin";
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
    const client = await createSupabaseServerClient();
    const { data } = await client.auth.getUser();
    const user = data.user;
    if (!user?.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    const db = supabaseServer();

    let targetWorkspaceId: string | null = null;
    if (workspaceSlug) {
      const { data: workspace, error: workspaceError } = await db
        .from("workspaces")
        .select("id")
        .eq("slug", workspaceSlug)
        .maybeSingle();
      if (workspaceError) {
        console.error("[oauth/google/start] workspace lookup failed", workspaceError);
      }
      // An unknown slug and a workspace the caller is not a member of answer
      // identically (403 below), so this cannot probe which slugs exist.
      if (!workspace) return NextResponse.json({ error: "no_workspace" }, { status: 403 });
      targetWorkspaceId = workspace.id;
    }

    let membershipQuery = db
      .from("workspace_members")
      .select("workspace_id, role, created_at")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null);
    if (targetWorkspaceId) membershipQuery = membershipQuery.eq("workspace_id", targetWorkspaceId);
    const { data: membershipRows, error: membershipError } = await membershipQuery
      // Same reasoning as owner-session.ts: a person can now legitimately
      // belong to more than one workspace. Pick the oldest membership,
      // matching what the dashboard itself shows as "the" workspace, rather
      // than letting a second row throw PGRST116 and silently 403 as if the
      // caller owned nothing.
      .order("created_at", { ascending: true })
      .limit(1);
    if (membershipError) {
      console.error("[oauth/google/start] membership lookup failed", membershipError);
    }
    const membership = membershipRows?.[0];

    const access = authorizeWorkspace({
      membership: membership ? { workspaceId: membership.workspace_id, role: membership.role } : null,
      sessionUser: { id: user.id, email: user.email ?? null },
    });
    // Staff must not be able to bind their own Google account to a merchant's
    // workspace, so this is member-only rather than "not none". A viewer must
    // not be able to bind it either — connecting/managing OAuth is an
    // owner/manager capability.
    if (access.kind !== "member" || access.role === "viewer") {
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
