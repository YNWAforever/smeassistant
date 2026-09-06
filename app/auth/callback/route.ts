import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getUser, signOut } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/admin";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";
import { claimsRepository } from "@/lib/repositories/claims";
import { safeReturnPath } from "@/lib/identity/return-path";
import { bindWorkspaceToUser } from "@/lib/workspace/bind-workspace";
import { shouldRecordAccessRequest } from "@/lib/workspace/access-request";
import { parseViewerGrantCookie, VIEWER_GRANT_COOKIE } from "@/lib/report-access/cookie";
import { tokenHashMatches } from "@/lib/report-access/token";
import { claimScan, type ClaimOutcome } from "@/lib/workspace/claim-scan";
import {
  attachJobToWorkspace,
  bindPendingMembership,
  createWorkspaceWithOwner,
  findOwnedWorkspace,
} from "@/lib/workspace/callback-queries";


interface LandingContext {
  locale: Locale;
  /** Validated claim slug, or null. */
  claimSlug: string | null;
  /** Validated same-origin path, or null. */
  returnTo: string | null;
}

/**
 * Where the browser lands, per the Phase 2 contract:
 *  - any `error` → `/{locale}/owner/sign-in?error=<code>[&claim=<slug>]`
 *  - claim present → `/{locale}/owner/onboarding?claim=<slug>[&claimed=<kind>]`
 *  - otherwise `returnTo` when valid, else `/{locale}/owner/select-workspace`.
 */
function landing(req: Request, ctx: LandingContext, params: Record<string, string>): URL {
  let path: string;
  if ("error" in params) path = `/${ctx.locale}/owner/sign-in`;
  else if (ctx.claimSlug) path = `/${ctx.locale}/owner/onboarding`;
  else path = ctx.returnTo ?? `/${ctx.locale}/owner/select-workspace`;
  const url = new URL(path, req.url);
  if (ctx.claimSlug) url.searchParams.set("claim", ctx.claimSlug);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

/**
 * True only if the caller presents the grant cookie actually issued for this job.
 * Mirrors the checks in authorizeReport rather than trusting cookie presence:
 * a cookie for someone else's report must not entitle a claim on this one.
 */
async function holdsViewerGrant(jobId: string): Promise<boolean> {
  const raw = (await cookies()).get(VIEWER_GRANT_COOKIE)?.value;
  const presented = raw ? parseViewerGrantCookie(raw) : null;
  if (!presented) return false;

  const { data } = await supabaseServer()
    .from("report_access_grants")
    .select("id, job_id, token_hash, expires_at, revoked_at")
    .eq("id", presented.grantId)
    .maybeSingle();

  if (!data || data.job_id !== jobId || data.revoked_at != null) return false;
  const expiry = Date.parse(data.expires_at);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;

  return tokenHashMatches(presented.rawToken, data.token_hash);
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);

  // Validated here, not only where the link is built. Unvalidated, `claim` is
  // interpolated into a path and `new URL("/r/../../en/staff", base)`
  // normalizes the /r/ prefix away — an unauthenticated redirect to any in-app
  // path with attacker-chosen query parameters before authentication.
  const rawClaim = requestUrl.searchParams.get("claim");
  const claimSlug = rawClaim && /^[A-Za-z0-9_-]{6,64}$/.test(rawClaim) ? rawClaim : null;
  const rawLocale = requestUrl.searchParams.get("locale");
  const ctx: LandingContext = {
    locale: isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE,
    claimSlug,
    returnTo: safeReturnPath(requestUrl.searchParams.get("returnTo") ?? "", "") || null,
  };

  try {
    // Managed Auth verifies links/OAuth; only fresh app-mapped identity is used here.
    if (requestUrl.searchParams.has("error")) {
      await signOut();
      return NextResponse.redirect(landing(req, ctx, { error: "invalid_code" }));
    }
    if (requestUrl.searchParams.has("neon_auth_session_verifier")) {
      const { getNeonAuth } = await import("@/lib/identity/neon");
      const exchanged = await getNeonAuth().middleware()(new NextRequest(req));
      const clean = new URL(req.url);
      clean.searchParams.delete("neon_auth_session_verifier");
      if (exchanged.headers.get("location") === clean.toString()) return exchanged;
      await signOut();
      return NextResponse.redirect(landing(req, ctx, { error: "invalid_code" }));
    }
    const user = await getUser();
    if (!user?.id || !user.verified) {
      await signOut();
      return NextResponse.redirect(landing(req, ctx, { error: "not_authorized" }));
    }

    // Runs on every verified sign-in, and before the claim branch below, so it
    // happens whether or not a slug was carried. Once bound the conditional
    // update matches zero rows, making this a cheap no-op; and a merchant who
    // signed in before BD assigned them gets picked up here on their next visit
    // instead of being stuck in a state nothing re-checks.
    await bindWorkspaceToUser({
      userId: user.id,
      verifiedEmail: user.email ?? null,
      // The concurrency and multi-invite story is documented on
      // bindPendingMembership itself.
      bindByEmail: () => bindPendingMembership(user),
    });

    // Ownership is read, not inferred. bindWorkspaceToUser returns "none" for an
    // already-bound owner (its conditional update matches zero rows once
    // user_id is set), so deciding from its outcome would file a request
    // on every sign-in by an established owner.
    //
    // Fail OPEN here: this value only feeds shouldRecordAccessRequest's
    // hasWorkspace flag, a best-effort BD signal, not an authorization
    // decision — so degrading to "couldn't confirm, log it, proceed" is
    // correct and matches the access-request block below, which wraps
    // itself in its own try/catch for the same reason.
    const { data: ownedWorkspace, error: ownedWorkspaceError } = await findOwnedWorkspace(
      user.id,
    );
    if (ownedWorkspaceError) {
      console.error("[owner/callback] owned-workspace lookup failed", {
        category: "owner_callback_query_failed",
      });
    }

    if (shouldRecordAccessRequest({ hasWorkspace: Boolean(ownedWorkspace), slug: claimSlug })) {
      // Non-fatal by design. The merchant authenticated; a BD signal that fails
      // to persist must not turn a successful sign-in into an error. Contrast
      // lib/staff/lead-access-log.ts, which throws — nothing is disclosed here.
      try {
        const requestedJob = await claimsRepository.jobBySlug(claimSlug!);
        if (requestedJob) await claimsRepository.recordAccessRequest(requestedJob.id, user.id);
      } catch {
        console.error("[owner/callback] access request not recorded", {
          category: "owner_access_request_failed",
        });
      }
    }

    // Signing in without a claim is legitimate — an owner returning later.
    // Upstream redirects to an unprefixed /owner here; in this app every route
    // is locale-prefixed, so landing() sends them to the validated returnTo or
    // to the locale's select-workspace page.
    if (!claimSlug) return NextResponse.redirect(landing(req, ctx, {}));

    const outcome: ClaimOutcome = await claimScan({
      slug: claimSlug,
      sessionUser: { id: user.id, email: user.email ?? null },
      // Off unless explicitly enabled. See claim-scan.ts: both entitlement
      // signals are writable by anyone holding the slug, so self-service
      // claiming is a scan-hijack primitive until an unforgeable proof exists.
      selfServiceEnabled: process.env.OWNER_SELF_SERVICE_CLAIM === "true",
      lookupJobBySlug: claimsRepository.jobBySlug,
      hasViewerGrant: holdsViewerGrant,
      // Earliest non-null lead, including repeated unlocks of the same report.
      lookupLeadEmail: claimsRepository.firstLeadEmail,
      // Fail CLOSED here, unlike the best-effort lookup above: claimScan's
      // whole function is wrapped in a top-level try/catch that turns any
      // thrown error into { kind: "unavailable" } — the correct, existing
      // pattern for this function's other injected lookups, several of which
      // already throw on error.
      findWorkspaceForUser: async (userId) => {
        const { data, error } = await findOwnedWorkspace(userId);
        if (error) throw new Error("workspace lookup failed");
        return data ? { id: data.workspaceId } : null;
      },
      createWorkspace: (input) => createWorkspaceWithOwner(input),
      attachJobToWorkspace: (jobId, workspaceId) => attachJobToWorkspace(jobId, workspaceId),
    });

    return NextResponse.redirect(landing(req, ctx, { claimed: outcome.kind }));
  } catch {
    // Generic, per house convention: never leak provider text to the client.
    console.error("Owner auth callback failed", { category: "auth_unavailable" });
    await signOut().catch(() => {});
    return NextResponse.redirect(landing(req, ctx, { error: "auth_unavailable" }));
  }
}
