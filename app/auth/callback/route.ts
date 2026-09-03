// Owner sign-in callback, and the point where an anonymous scan becomes owned.
//
// Deliberately NOT an extension of /auth/callback. That route ends in
// `isAllowedStaffEmail(email)` and redirects everyone else to not_authorized —
// an owner arriving there would simply be rejected. Teaching one route two
// different authorization rules is how "which rules apply here?" bugs start, and
// this is the wrong place to invite them.
//
// Note /auth/ is excluded from the next-intl matcher (see middleware.ts). Without
// that, this path would be rewritten to /en/auth/owner/callback and the code
// exchange would fail on a code that never arrived.
//
// Ported from upstream app/auth/owner/callback/route.ts. This app has no staff
// console, so the handler lives at /auth/callback (proxy.ts excludes /auth/ from
// the locale matcher for the same reason as above). The only local change is
// where it lands: every route here is locale-prefixed, so the redirect targets
// are built from the `locale` and `returnTo` query params carried through the
// magic link (CLAUDE.md §3.1, Phase 2 contract).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseServer } from "@/lib/supabase/admin";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";
import { safeReturnTo } from "@/lib/funnel/locale-redirect";
import { bindWorkspaceToUser } from "@/lib/workspace/bind-workspace";
import { recordAccessRequest, shouldRecordAccessRequest } from "@/lib/workspace/access-request";
import { parseViewerGrantCookie, VIEWER_GRANT_COOKIE } from "@/lib/report-access/cookie";
import { tokenHashMatches } from "@/lib/report-access/token";
import { claimScan, type ClaimOutcome } from "@/lib/workspace/claim-scan";
import {
  attachJobToWorkspace,
  bindPendingMembership,
  createWorkspaceWithOwner,
  findOwnedWorkspace,
} from "@/lib/workspace/callback-queries";

type OwnerAuthClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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

async function clearLocalSession(client?: OwnerAuthClient): Promise<void> {
  try {
    const authClient = client ?? (await createSupabaseServerClient());
    await authClient.auth.signOut({ scope: "local" });
  } catch {
    // A safe redirect is still the correct response when auth is unavailable.
  }
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
  const code = requestUrl.searchParams.get("code");
  // Validated here, not only where the link is built. Unvalidated, `claim` is
  // interpolated into a path and `new URL("/r/../../en/staff", base)`
  // normalizes the /r/ prefix away — an unauthenticated redirect to any in-app
  // path with attacker-chosen query parameters, reachable on the no-code branch
  // before any authentication happens.
  const rawClaim = requestUrl.searchParams.get("claim");
  const claimSlug = rawClaim && /^[A-Za-z0-9_-]{6,64}$/.test(rawClaim) ? rawClaim : null;
  const rawLocale = requestUrl.searchParams.get("locale");
  const ctx: LandingContext = {
    locale: isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE,
    claimSlug,
    returnTo: safeReturnTo(requestUrl.searchParams.get("returnTo")),
  };

  if (!code) {
    await clearLocalSession();
    return NextResponse.redirect(landing(req, ctx, { error: "missing_code" }));
  }

  try {
    const client = await createSupabaseServerClient();
    const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      await clearLocalSession(client);
      return NextResponse.redirect(landing(req, ctx, { error: "invalid_code" }));
    }

    const { data, error: userError } = await client.auth.getUser();
    const user = data.user;
    const verified = Boolean(user?.email_confirmed_at ?? user?.confirmed_at);
    if (userError || !user?.id || !verified) {
      await clearLocalSession(client);
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
      bindByEmail: (userId, email) => bindPendingMembership(supabaseServer(), userId, email),
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
      supabaseServer(),
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
        const requestDb = supabaseServer();
        const { data: requestedJob } = await requestDb
          .from("audit_jobs")
          .select("id")
          .eq("share_slug", claimSlug)
          .maybeSingle();

        if (requestedJob?.id) {
          const { data: open } = await requestDb
            .from("workspace_access_requests")
            .select("id")
            .eq("job_id", requestedJob.id)
            .eq("user_id", user.id)
            .is("resolved_at", null)
            .maybeSingle();

          // Checked rather than relied upon: the partial unique index is the real
          // guarantee, but a duplicate insert would log noise on every re-visit.
          if (!open?.id) {
            await recordAccessRequest(
              { jobId: requestedJob.id, userId: user.id },
              {
                insert: async (row) =>
                  await requestDb.from("workspace_access_requests").insert(row),
              },
            );
          }
        }
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

    const db = supabaseServer();
    const outcome: ClaimOutcome = await claimScan({
      slug: claimSlug,
      sessionUser: { id: user.id, email: user.email ?? null },
      // Off unless explicitly enabled. See claim-scan.ts: both entitlement
      // signals are writable by anyone holding the slug, so self-service
      // claiming is a scan-hijack primitive until an unforgeable proof exists.
      selfServiceEnabled: process.env.OWNER_SELF_SERVICE_CLAIM === "true",
      lookupJobBySlug: async (slug) => {
        const { data: job } = await db
          .from("audit_jobs")
          .select("id, workspace_id, business_name, industry, district, region")
          .eq("share_slug", slug)
          .maybeSingle();
        return job ?? null;
      },
      hasViewerGrant: holdsViewerGrant,
      lookupLeadEmail: async (jobId) => {
        // NOT maybeSingle(): leads.job_id has no uniqueness, and unlocking the
        // same report twice inserts a second row. postgrest turns >1 row into
        // data=null plus PGRST116, and the discarded error made this return
        // null for exactly the owners who unlocked more than once. Ordered and
        // limited instead, so the choice is the earliest lead rather than
        // whichever row the planner happened to return.
        const { data: leads, error } = await db
          .from("leads")
          .select("email, created_at")
          .eq("job_id", jobId)
          .not("email", "is", null)
          .order("created_at", { ascending: true })
          .limit(1);
        if (error) throw new Error("lead lookup failed");
        return leads?.[0]?.email ?? null;
      },
      // Fail CLOSED here, unlike the best-effort lookup above: claimScan's
      // whole function is wrapped in a top-level try/catch that turns any
      // thrown error into { kind: "unavailable" } — the correct, existing
      // pattern for this function's other injected lookups, several of which
      // already throw on error.
      findWorkspaceForUser: async (userId) => {
        const { data, error } = await findOwnedWorkspace(db, userId);
        if (error) throw new Error("workspace lookup failed");
        return data ? { id: data.workspaceId } : null;
      },
      createWorkspace: (input) => createWorkspaceWithOwner(db, input),
      attachJobToWorkspace: (jobId, workspaceId) => attachJobToWorkspace(db, jobId, workspaceId),
    });

    return NextResponse.redirect(landing(req, ctx, { claimed: outcome.kind }));
  } catch (error) {
    // Generic, per house convention: never leak provider text to the client.
    console.error("Owner auth callback failed", error);
    await clearLocalSession();
    return NextResponse.redirect(landing(req, ctx, { error: "auth_unavailable" }));
  }
}
