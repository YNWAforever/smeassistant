import { NextResponse, NextRequest } from "next/server";

import { cleanCallbackHandoff } from "@/lib/identity/callback-handoff";
import { identityProvider } from "@/lib/identity/composition";
import { MANAGED_SESSION_COOKIES, expiredAuthCookie } from "@/lib/identity/cookies";
import { authDiagnostic } from "@/lib/identity/sign-in-diagnostics";
import { authFlowHref, parseAuthFlow, type AuthFlow } from "@/lib/identity/sign-in-flow";

/**
 * Ends a failed attempt: a best-effort upstream revocation, then a redirect
 * that itself expires the session cookies. This route is reached by top-level
 * navigation from a mail client or Google, so the browser sends the SDK
 * challenge cookie but no Origin header; managed Auth's upstream sign-out is a
 * cookie-bearing POST that better-auth rejects as MISSING_OR_NULL_ORIGIN. That
 * rejection must not turn an expired or reused link into an "auth unavailable"
 * outage, and local invalidation must not depend on it, so the cookies are
 * expired on the response that is returned.
 *
 * The challenge cookies are deliberately kept (lib/auth signOut() would clear
 * them, so it is not used here): each link request overwrites the single
 * challenge, so it belongs to the newest link. Clearing it when an older link
 * fails made the newer, still-valid link fail too (production, 2026-10-11).
 */
async function failedAttempt(url: URL): Promise<NextResponse> {
  try {
    await (await identityProvider()).signOut();
  } catch {
    // Expected for this navigation (see above); the session cookies are still expired below.
  }
  const response = NextResponse.redirect(url);
  for (const name of MANAGED_SESSION_COOKIES) response.cookies.set(name, "", expiredAuthCookie);
  return response;
}

function landing(request: Request, flow: AuthFlow, error?: string): URL {
  const url = new URL(authFlowHref(flow, error ? "start" : "complete"), request.url);
  if (error) url.searchParams.set("error", error);
  return url;
}

/** This route exchanges managed-auth verifier cookies only. Application
 * authorization and claim effects run through the same-origin completion POST. */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const flow = parseAuthFlow(requestUrl.searchParams);
  const correlationId = crypto.randomUUID();
  try {
    if (requestUrl.searchParams.has("error")) {
      return await failedAttempt(landing(request, flow, requestUrl.searchParams.get("error") === "access_denied" ? "cancelled" : "invalid_code"));
    }
    if (requestUrl.searchParams.has("neon_auth_session_verifier")) {
      const exchanged = process.env.SME_TEST_IDENTITY
        ? await (await import("@/test/e2e/composition")).exchangeFixtureVerifier(request)
        // Root cause of the production "verifier_exchange" failure: `request` in
        // Next's compiled production route handler is a Proxy wrapper around the
        // native Request, and on Node 24 the Request copy constructor cannot read
        // that wrapper's private Undici fields ("Cannot read private member
        // #state from an object whose class did not declare it") -- the exact
        // class of bug already found and fixed for a sibling route in commit
        // b991b7f ("fix: forward wrapped Auth requests on Node 24",
        // app/api/auth/[...path]/route.ts) but never applied here. Constructing
        // from the URL string plus explicitly copied headers, instead of
        // copy-constructing from the wrapped request object, avoids the private
        // field entirely. Confirmed locally with a Proxy-wrapped Request matching
        // that commit's own reproduction technique; see route.test.ts.
        : await (await import("@/lib/identity/neon")).getNeonAuth().middleware()(
          new NextRequest(request.url, { headers: new Headers(request.headers) }),
        );
      if (exchanged) {
        const handoff = cleanCallbackHandoff(request, exchanged);
        if (handoff) return handoff;
      }
      return await failedAttempt(landing(request, flow, requestUrl.searchParams.get("error") === "access_denied" ? "cancelled" : "invalid_code"));
    }
    return NextResponse.redirect(landing(request, flow));
  } catch {
    console.error(authDiagnostic("verifier_exchange", correlationId));
    return await failedAttempt(landing(request, flow, "auth_unavailable"));
  }
}