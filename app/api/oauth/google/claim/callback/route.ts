import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseServer } from "@/lib/supabase/admin";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";
import { claimViaOAuthEnabled } from "@/lib/oauth/claim-flow-flag";
import { GBP_SCOPE_REQUIRED, exchangeCode, verifyClaimState } from "@/lib/oauth/google-connection";
import { listManagedPlaceIds } from "@/lib/oauth/google-business-profile";
import { encryptToken } from "@/lib/security/token-crypto";
import {
  attachJobToWorkspace,
  createWorkspaceWithOwner,
  findOwnedWorkspace,
} from "@/lib/workspace/callback-queries";

/**
 * Verifies Google's own attestation of GBP ownership, then -- and only then --
 * creates the workspace, the owning membership, the oauth_connections row, and
 * attaches the job. Every step before the place_id match is read-only; nothing
 * is written on any failure path.
 *
 * Gated on claimViaOAuthEnabled() as the very first check, before even the
 * signed state is parsed -- see claim/start/route.ts's comment for why: this
 * route's URL is not secret, so the flag has to gate the route itself, not
 * merely the UI link that points at it. The whole feature still ships dark
 * today regardless, because GOOGLE_OAUTH_CLAIM_REDIRECT_URI is unset in
 * production -- but that must be an intentional second gate, not the only one.
 *
 * This is the only path (besides Fimmick staff assignment) that attaches a
 * job to a workspace -- CLAUDE.md guardrail 15. `POST /api/workspaces/claim`
 * then completes the workspace (locations, brand profile, usage) and never
 * attaches anything itself.
 */
const SLUG_RE = /^[A-Za-z0-9_-]{6,64}$/;

function back(
  origin: string,
  locale: Locale,
  slug: string | null,
  params: Record<string, string>,
  outcome: "failure" | "success" = "failure",
): NextResponse {
  // The merchant going through this flow has no workspace *until a claim
  // succeeds*, so an owner page would only ever show an empty state on a
  // failure -- invisible to exactly the user this feature serves. Redirect
  // back to the report instead whenever a slug is available. Callers pass
  // slug: null with no better destination -- the flag-off short-circuit
  // (nothing parsed yet) and `invalid_state` (the state itself didn't parse)
  // -- and land on the workspace picker.
  //
  // smeassistant: every route is locale-prefixed, and success continues the
  // onboarding flow (`/{locale}/owner/onboarding?claim=<slug>&claimed=1`)
  // instead of upstream's unprefixed /owner dashboard.
  const validSlug = slug && SLUG_RE.test(slug) ? slug : null;
  let target: string;
  if (outcome === "success" && validSlug) target = `/${locale}/owner/onboarding`;
  else if (validSlug) target = `/${locale}/r/${validSlug}`;
  else target = `/${locale}/owner/select-workspace`;
  const url = new URL(target, origin);
  if (outcome === "success" && validSlug) url.searchParams.set("claim", validSlug);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");

  if (!claimViaOAuthEnabled()) return back(origin, DEFAULT_LOCALE, null, { claim: "unavailable" });

  // Parsed before the error/code checks below so a declined or otherwise
  // incomplete return trip still recovers `slug` (and the locale) from the
  // echoed `state` -- Google returns the original `state` parameter on an
  // error redirect too, not only on success.
  const payload = state ? verifyClaimState(state) : null;
  const slug = payload?.slug ?? null;
  const locale: Locale = isLocale(payload?.locale) ? payload.locale : DEFAULT_LOCALE;

  if (requestUrl.searchParams.get("error")) return back(origin, locale, slug, { claim: "declined" });
  if (!code || !state) return back(origin, locale, slug, { claim: "invalid" });
  if (!payload) return back(origin, locale, null, { claim: "invalid_state" });

  try {
    const client = await createSupabaseServerClient();
    const { data } = await client.auth.getUser();
    const user = data.user;
    if (!user?.id) return back(origin, locale, payload.slug, { claim: "unauthenticated" });

    const tokens = await exchangeCode(code, process.env.GOOGLE_OAUTH_CLAIM_REDIRECT_URI);
    if (!tokens) return back(origin, locale, payload.slug, { claim: "exchange_failed" });
    if (!tokens.refreshToken) {
      console.error("[oauth/google/claim/callback] consent returned no refresh token");
      return back(origin, locale, payload.slug, { claim: "no_refresh_token" });
    }
    if (!tokens.scopes.includes(GBP_SCOPE_REQUIRED)) {
      console.error("[oauth/google/claim/callback] consent omitted the business.manage scope");
      return back(origin, locale, payload.slug, { claim: "missing_scope" });
    }

    // Everything above is read-only. Everything from here is gated on the
    // place_id match below -- no row is written before this point.
    let managed;
    try {
      managed = await listManagedPlaceIds(tokens.accessToken);
    } catch (error) {
      console.error(
        "[oauth/google/claim/callback] Business Profile API call failed",
        error instanceof Error ? error.message : "unknown",
      );
      return back(origin, locale, payload.slug, { claim: "verification_failed" });
    }

    const match = managed.find((location) => location.placeId === payload.placeId);
    if (!match) return back(origin, locale, payload.slug, { claim: "place_not_managed" });

    const db = supabaseServer();
    const { data: job } = await db
      .from("audit_jobs")
      .select("id, business_name, industry, district, region")
      .eq("id", payload.jobId)
      .maybeSingle();
    if (!job) return back(origin, locale, payload.slug, { claim: "not_found" });

    const { data: existing, error: findError } = await findOwnedWorkspace(db, user.id);
    if (findError) throw new Error("workspace lookup failed");

    const workspace =
      existing != null
        ? { id: existing.workspaceId }
        : await createWorkspaceWithOwner(db, {
            ownerUserId: user.id,
            ownerEmail: user.email ?? "",
            businessName: job.business_name ?? null,
            industry: job.industry ?? null,
            district: job.district ?? null,
            market: job.region ?? null,
          });

    const attached = await attachJobToWorkspace(db, job.id, workspace.id);
    if (!attached) return back(origin, locale, payload.slug, { claim: "already_claimed" });

    const encrypted = {
      access_token_encrypted: encryptToken(tokens.accessToken),
      refresh_token_encrypted: encryptToken(tokens.refreshToken),
    };
    const { data: inserted, error: insertError } = await db
      .from("oauth_connections")
      .insert({
        workspace_id: workspace.id,
        provider: "google_gbp",
        account_ref: match.locationName,
        ...encrypted,
        scopes: tokens.scopes,
        expires_at: tokens.expiresAt,
        status: "expired",
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      console.error("[oauth/google/claim/callback] connection insert failed");
      return back(origin, locale, payload.slug, { claim: "storage_failed" });
    }

    const nowIso = new Date().toISOString();

    // Retire any predecessor before promoting the new row, mirroring the
    // connect-flow callback exactly. findOwnedWorkspace can return an existing
    // workspace that already has an active google_gbp connection (the owner
    // connected once before, or is claiming a second scan), and
    // oauth_connections_active_provider_key only allows one active row per
    // (workspace_id, provider). Without this, the promote below would 23505 --
    // and by then attachJobToWorkspace has already run, so the job would be
    // stuck attached with no way to retry.
    const { error: revokeError } = await db
      .from("oauth_connections")
      .update({ status: "revoked", updated_at: nowIso })
      .eq("workspace_id", workspace.id)
      .eq("provider", "google_gbp")
      .eq("status", "active");
    if (revokeError) {
      console.error("[oauth/google/claim/callback] predecessor revoke failed");
      return back(origin, locale, payload.slug, { claim: "storage_failed" });
    }

    const { error: promoteError } = await db
      .from("oauth_connections")
      .update({ status: "active", updated_at: nowIso })
      .eq("id", inserted.id)
      .eq("status", "expired");
    if (promoteError) {
      console.error("[oauth/google/claim/callback] connection promote failed");
      return back(origin, locale, payload.slug, { claim: "storage_failed" });
    }

    // Best-effort. The claim itself already succeeded; a failed audit insert
    // must not turn a successful claim into an error shown to the owner.
    const { error: eventError } = await db.from("workspace_claim_events").insert({
      job_id: job.id,
      workspace_id: workspace.id,
      matched_location_id: match.locationName,
      claimed_by_user_id: user.id,
    });
    if (eventError) {
      console.error("[oauth/google/claim/callback] claim event not recorded", { category: "claim_event_failed" });
    }

    // Same posture for this app's own append-only audit log (CLAUDE.md
    // §3.11 `workspace.claimed`; guardrail 10). workspace_claim_events above
    // is upstream's staff-console table, audit_events is what the Activity
    // page renders.
    const { error: auditError } = await db.from("audit_events").insert({
      workspace_id: workspace.id,
      actor_type: "user",
      actor_id: user.id,
      event: "workspace.claimed",
      entity_type: "audit_job",
      entity_id: job.id,
      payload: { locale },
    });
    if (auditError) {
      console.error("[oauth/google/claim/callback] audit event not recorded", { category: "audit_event_failed" });
    }

    // The merchant now has a workspace attached to this job; onboarding picks
    // the flow up (`claimed=1`) and POSTs /api/workspaces/claim to complete it.
    return back(origin, locale, payload.slug, { claimed: "1" }, "success");
  } catch (error) {
    console.error("[oauth/google/claim/callback] failed", error);
    return back(origin, locale, payload.slug, { claim: "unavailable" });
  }
}
