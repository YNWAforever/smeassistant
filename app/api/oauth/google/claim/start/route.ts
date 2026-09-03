import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseServer } from "@/lib/supabase/admin";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { claimViaOAuthEnabled } from "@/lib/oauth/claim-flow-flag";
import { buildConsentUrl, googleOAuthClaimConfigured, signClaimState } from "@/lib/oauth/google-connection";

/**
 * Begins the OAuth-verified self-service claim flow for a specific job.
 *
 * Deliberately NOT the existing /api/oauth/google/start: that route requires
 * the caller to already be a workspace_members row for a workspace that
 * already exists. This route is for the opposite case -- no workspace exists
 * yet, and completing this flow is what creates one, but only once the
 * callback verifies Google's own attestation of ownership.
 *
 * A signed-in Supabase session is still required (via the existing owner
 * magic-link flow) -- Google OAuth here is an ownership proof and an API
 * credential, never an identity provider.
 *
 * smeassistant addition: `?locale=` rides along in the signed state so the
 * callback can redirect to `/{locale}/…` (every route here is locale-prefixed).
 */
const SLUG_RE = /^[A-Za-z0-9_-]{6,64}$/;

export async function GET(req: Request) {
  // claimViaOAuthEnabled() is the very first check, before even the config
  // check below: this route's URL is not secret (it appears in the report
  // page's own markup once ClaimWithGoogleCard renders, and will show up in
  // /owner's network requests once this ships), so without gating the route
  // itself the flag would only ever hide the UI link -- anyone who found the
  // URL directly could still drive the flow while the flag is off, relying
  // solely on GOOGLE_OAUTH_CLAIM_REDIRECT_URI being unset in production. That
  // inverts the intended staged rollout: registering the redirect uri is
  // supposed to *prepare* the flow, flipping this flag is supposed to be what
  // *opens* it.
  if (!claimViaOAuthEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Not googleOAuthConfigured(): the claim flow needs its own authorized
  // redirect uri (GOOGLE_OAUTH_CLAIM_REDIRECT_URI), separate from the connect
  // flow's GOOGLE_OAUTH_REDIRECT_URI. An unset claim redirect uri would send a
  // real user's consent back to the connect callback, which runs verifyState
  // (not verifyClaimState) on a "claim"-domain signed state and fails with
  // invalid_state -- unreachable in production despite passing every test
  // that stubs the config check.
  if (!googleOAuthClaimConfigured()) {
    console.error("[oauth/google/claim/start] Google OAuth claim flow is not configured");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const requestUrl = new URL(req.url);
  const slug = requestUrl.searchParams.get("slug");
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const requestedLocale = requestUrl.searchParams.get("locale");
  const locale = isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;

  try {
    const client = await createSupabaseServerClient();
    const { data } = await client.auth.getUser();
    if (!data.user?.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    const { data: job, error: jobError } = await supabaseServer()
      .from("audit_jobs")
      .select("id, place_id, workspace_id")
      .eq("share_slug", slug)
      .maybeSingle();
    // Matches /api/oauth/google/start's membershipError posture: log, do not
    // leak. Without this a Postgres outage is indistinguishable in the logs
    // from an ordinary bad slug -- the client response is identical either
    // way (404 not_found), which is correct; only the log needs the detail.
    if (jobError) console.error("[oauth/google/claim/start] job lookup failed", jobError);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!job.place_id) return NextResponse.json({ error: "no_place_id" }, { status: 422 });
    if (job.workspace_id) return NextResponse.json({ error: "already_claimed" }, { status: 409 });

    const state = signClaimState(job.id, job.place_id, slug, undefined, locale);
    return NextResponse.redirect(buildConsentUrl(state, process.env.GOOGLE_OAUTH_CLAIM_REDIRECT_URI));
  } catch (error) {
    console.error("[oauth/google/claim/start] failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
