import { NextResponse } from "next/server";
import { getNeonAuth } from "@/lib/identity/neon";
import { safeReturnPath } from "@/lib/identity/return-path";
import { MANAGED_AUTH_COOKIES, expiredAuthCookie } from "@/lib/identity/cookies";

type Context = { params: Promise<{ path: string[] }> };
function unavailable() {
  return NextResponse.json({ error: "auth_unavailable", correlationId: crypto.randomUUID() }, { status: 503 });
}
function freshRequest(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("cookie", (headers.get("cookie") ?? "").split(";")
    .filter(part => part.trim().split("=")[0] !== "__Secure-neon-auth.local.session_data").join(";"));
  return new Request(request, { headers });
}
function callback(value: unknown, origin: string): URL | null {
  if (typeof value !== "string" || !safeReturnPath(value, "")) return null;
  const url = new URL(value, origin);
  return url.pathname === "/auth/callback" ? url : null;
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
    if (path === "sign-in/magic-link" || path === "sign-in/social") {
      let body: Record<string, unknown>;
      try { body = await request.clone().json(); }
      catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
      const target = callback(body.callbackURL, new URL(request.url).origin);
      if (!target || [body.errorCallbackURL, body.newUserCallbackURL].some(value => value !== undefined && !callback(value, new URL(request.url).origin))) {
        return NextResponse.json({ error: "invalid_callback" }, { status: 400 });
      }
      if (path === "sign-in/magic-link") {
        // Reuse the existing rate limit, recipient bound and uniform outcome.
        // Direct SDK traffic must never bypass the application's mail guard.
        const claim = target.searchParams.get("claim");
        const { POST: send } = claim
          ? await import("@/app/api/owner/magic-link/route")
          : await import("@/app/api/workspace-invites/magic-link/route");
        return send(new Request(request.url, {
          method: "POST", headers: request.headers,
          body: JSON.stringify({ email: body.email, slug: claim, locale: target.searchParams.get("locale"), returnTo: target.searchParams.get("returnTo") }),
        }));
      }
      if (body.provider !== "google") return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
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
