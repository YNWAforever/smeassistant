import { NextResponse } from "next/server";
import { getNeonAuth } from "@/lib/identity/neon";
import { callbackHref, parseAuthFlow } from "@/lib/identity/sign-in-flow";
import { MANAGED_AUTH_COOKIES, expiredAuthCookie } from "@/lib/identity/cookies";
import { enforceCompositeIdentifierRateLimit, rateLimitedResponse, rateLimitUnavailableResponse } from "@/lib/security/rate-limit";

type Context = { params: Promise<{ path: string[] }> };
function unavailable() {
  return NextResponse.json({ error: "auth_unavailable", correlationId: crypto.randomUUID() }, { status: 503 });
}
function freshRequest(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("cookie", (headers.get("cookie") ?? "").split(";")
    .filter(part => part.trim().split("=")[0] !== "__Secure-neon-auth.local.session_data").join(";"));
  return new Request(request.url, { method: "GET", headers });
}
function callback(value: unknown, origin: string): URL | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  const url = new URL(value, origin);
  if (url.origin !== origin || url.pathname !== "/auth/callback") return null;
  return new URL(callbackHref(parseAuthFlow(url.searchParams)), origin);
}
export async function GET(request: Request, context: Context) {
  try {
    if (process.env.SME_TEST_IDENTITY) return await (await import("@/test/e2e/composition")).handleFixtureAuth(request, (await context.params).path.join("/"));
    return await getNeonAuth().handler().GET(freshRequest(request), context); }
  catch { return unavailable(); }
}
export async function POST(request: Request, context: Context) {
  const path = (await context.params).path.join("/");
  let response: Response;
  try {
    if (path === "sign-in/email-otp") {
      if (request.headers.get("origin") !== new URL(request.url).origin) {
        return NextResponse.json({ error: "invalid_origin" }, { status: 400 });
      }
      let body: Record<string, unknown>;
      try { body = await request.clone().json(); }
      catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof body.otp !== "string" || !/^\d{6}$/.test(body.otp)) {
        return NextResponse.json({ error: "invalid_code_input" }, { status: 400 });
      }
      const limiter = await enforceCompositeIdentifierRateLimit({ req: request, scope: "owner_otp_verify", identifier: email, failClosed: true });
      if (limiter.unavailable) return rateLimitUnavailableResponse();
      if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);
      const headers = new Headers(request.headers);
      for (const name of ["cookie", "authorization", "content-length"]) headers.delete(name);
      headers.set("content-type", "application/json");
      request = new Request(request.url, { method: "POST", headers, body: JSON.stringify({ email, otp: body.otp }) });
    } else if (path === "sign-in/magic-link" || path === "sign-in/social" || path === "email-otp/send-verification-otp") {
      let body: Record<string, unknown>;
      try { body = await request.clone().json(); }
      catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
      const codeDelivery = path === "email-otp/send-verification-otp";
      if (codeDelivery && body.type !== "sign-in") return NextResponse.json({ error: "invalid_email_type" }, { status: 400 });
      const origin = new URL(request.url).origin;
      const target = callback(body.callbackURL, origin);
      const errorTarget = body.errorCallbackURL === undefined ? null : callback(body.errorCallbackURL, origin);
      const newUserTarget = body.newUserCallbackURL === undefined ? null : callback(body.newUserCallbackURL, origin);
      if (!target || (body.errorCallbackURL !== undefined && !errorTarget) || (body.newUserCallbackURL !== undefined && !newUserTarget)) {
        return NextResponse.json({ error: "invalid_callback" }, { status: 400 });
      }
      if (path === "sign-in/magic-link" || codeDelivery) {
        // Reuse the existing rate limit, recipient bound and uniform outcome.
        // Direct SDK traffic must never bypass the application's mail guard.
        const claim = target.searchParams.get("claim");
        const { POST: send } = claim
          ? await import("@/app/api/owner/magic-link/route")
          : await import("@/app/api/workspace-invites/magic-link/route");
        return send(new Request(request.url, {
          method: "POST", headers: request.headers,
          body: JSON.stringify({ email: body.email, slug: claim, locale: target.searchParams.get("locale"), returnTo: target.searchParams.get("returnTo"), method: target.searchParams.get("method"), ...(codeDelivery ? { delivery: "code" } : {}) }),
        }));
      }
      if (body.provider !== "google") return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      request = new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify({
          ...body,
          callbackURL: `${target.pathname}${target.search}`,
          ...(errorTarget ? { errorCallbackURL: `${errorTarget.pathname}${errorTarget.search}` } : {}),
          ...(newUserTarget ? { newUserCallbackURL: `${newUserTarget.pathname}${newUserTarget.search}` } : {}),
        }),
      });
    } else if (path !== "sign-out") {
      // No password/signup/reset mail surface is exposed by this application.
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    response = process.env.SME_TEST_IDENTITY
      ? await (await import("@/test/e2e/composition")).handleFixtureAuth(request, path)
      : await getNeonAuth().handler().POST(request, context);
  } catch { response = unavailable(); }
  if (path === "sign-out") {
    const cleared = new NextResponse(response.body, { status: response.status, headers: response.headers });
    for (const name of MANAGED_AUTH_COOKIES) cleared.cookies.set(name, "", expiredAuthCookie);
    return cleared;
  }
  return response;
}
