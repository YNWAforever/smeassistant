import { NextResponse, NextRequest } from "next/server";

import { signOut } from "@/lib/auth";
import { cleanCallbackHandoff } from "@/lib/identity/callback-handoff";
import { authDiagnostic } from "@/lib/identity/sign-in-diagnostics";
import { authFlowHref, parseAuthFlow, type AuthFlow } from "@/lib/identity/sign-in-flow";

export { cleanCallbackHandoff } from "@/lib/identity/callback-handoff";

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
      await signOut();
      return NextResponse.redirect(landing(request, flow, requestUrl.searchParams.get("error") === "access_denied" ? "cancelled" : "invalid_code"));
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
      await signOut();
      return NextResponse.redirect(landing(request, flow, requestUrl.searchParams.get("error") === "access_denied" ? "cancelled" : "invalid_code"));
    }
    return NextResponse.redirect(landing(request, flow));
  } catch {
    console.error(authDiagnostic("verifier_exchange", correlationId));
    await signOut().catch(() => {});
    return NextResponse.redirect(landing(request, flow, "auth_unavailable"));
  }
}