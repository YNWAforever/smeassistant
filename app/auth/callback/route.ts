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
      const { getNeonAuth } = await import("@/lib/identity/neon");
      const exchanged = await getNeonAuth().middleware()(new NextRequest(request));
      const handoff = cleanCallbackHandoff(request, exchanged);
      if (handoff) return handoff;
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