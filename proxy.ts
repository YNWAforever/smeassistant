import { getNeonAuth } from "@/lib/identity/neon";
import { MANAGED_AUTH_COOKIES, MANAGED_SESSION_COOKIES } from "@/lib/identity/cookies";
import { verifiedSessionIdentity } from "@/lib/identity/session-identity";
import { identityMessages } from "@/lib/copy-identity";
import { NextResponse, NextRequest } from "next/server";

import {
  LOCALE_HEADER,
  isOwnerGatedPath,
  localeFromPathname,
  resolveLegacyRedirect,
  resolveLocaleRedirect,
  signInRedirectFor,
} from "@/lib/funnel/locale-redirect";
import { resolveWorkspaceRedirect } from "@/lib/workspace/route-redirects";

/** Locale routing and fresh managed-session gate; application routes enforce membership. */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const legacy = resolveLegacyRedirect(pathname);
  if (legacy) {
    const url = request.nextUrl.clone();
    url.pathname = legacy;
    return NextResponse.redirect(url, 308);
  }
  // Phase 4: old workspace pages moved under the five destinations; the query is kept.
  const moved = resolveWorkspaceRedirect(pathname, search);
  if (moved) return NextResponse.redirect(new URL(moved, request.url), 308);
  const target = resolveLocaleRedirect(pathname);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 307);
  }
  const locale = localeFromPathname(pathname);
  if (!locale) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  const response = NextResponse.next({ request: { headers } });
  if (!isOwnerGatedPath(pathname)) return response;

  const loginUrl = new URL(signInRedirectFor(locale, pathname, search), request.url);
  const unavailable = () => new NextResponse(identityMessages[locale].unavailable, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "content-language": locale },
  });
  const forwardCookies = (source: Response, target: NextResponse) => {
    for (const raw of source.headers.getSetCookie()) {
      const parsed = new NextResponse(null, { headers: { "set-cookie": raw } });
      for (const cookie of parsed.cookies.getAll()) {
        // Next's cookie parser drops falsy attributes, including Max-Age=0.
        // Keep SDK deletion instructions effective when reserializing them.
        if (/(?:^|;)\s*max-age\s*=\s*0\s*(?:;|$)/i.test(raw)) {
          cookie.maxAge = 0;
          cookie.expires = new Date(0);
          cookie.value = "";
        } else if (cookie.maxAge === undefined && cookie.expires && new Date(cookie.expires).getTime() <= Date.now()) {
          cookie.value = "";
        }
        target.cookies.set(cookie);
      }
    }
    return target;
  };
  try {
    if (process.env.SME_TEST_IDENTITY) {
      const { fixtureProvider } = await import("@/test/e2e/composition");
      if (await (await fixtureProvider(request)).getIdentity()) return response;
      return NextResponse.redirect(loginUrl, 307);
    }
    const sdk = getNeonAuth();
    const hasHandoff = request.nextUrl.searchParams.has("neon_auth_session_verifier")
      && MANAGED_AUTH_COOKIES.slice(2).some(name => request.cookies.has(name));
    if (hasHandoff) {
      // Retain the pinned SDK's OAuth exchange and cookie minting. A failed
      // exchange is inconclusive here; the canonical callback owns invalid codes.
      const validationHeaders = new Headers(headers);
      validationHeaders.set("cookie", (headers.get("cookie") ?? "").split(";")
        .filter(part => part.trim().split("=")[0] !== MANAGED_SESSION_COOKIES[1]).join(";"));
      const managed = await sdk.middleware({ loginUrl: loginUrl.toString() })(
        new NextRequest(request.url, { headers: validationHeaders }),
      );
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.searchParams.delete("neon_auth_session_verifier");
      if (managed.headers.get("location") === cleanUrl.href) return managed;
      return unavailable();
    }
    if (!request.cookies.has(MANAGED_SESSION_COOKIES[0])) return NextResponse.redirect(loginUrl, 307);
    // Inspect the public handler's HTTP outcome: middleware collapses outages
    // into an absent session. Bypass local cache without a second preflight.
    const validationUrl = new URL("/api/auth/get-session", request.url);
    validationUrl.searchParams.set("disableCookieCache", "true");
    const sessionHeaders = new Headers(headers);
    sessionHeaders.delete("referer");
    sessionHeaders.delete("authorization");
    const sessionResponse = await sdk.handler().GET(
      new Request(validationUrl.href, { headers: sessionHeaders }),
      { params: Promise.resolve({ path: ["get-session"] }) },
    );
    if (sessionResponse.status === 401 || sessionResponse.status === 403) {
      return forwardCookies(sessionResponse, NextResponse.redirect(loginUrl, 307));
    }
    if (sessionResponse.status !== 200) return unavailable();
    // Parsing failures are dependency failures, distinct from authoritative null.
    const session: unknown = await sessionResponse.json();
    const target = verifiedSessionIdentity(session) ? response : NextResponse.redirect(loginUrl, 307);
    return forwardCookies(sessionResponse, target);
  } catch {
    // Deny access without claiming a confirmed sign-out or clearing the session.
    return unavailable();
  }
}

export const config = {
  matcher: ["/((?!api|auth/|_next|_vercel|opengraph-image|twitter-image|icon|apple-icon|.*\\..*).*)"],
};
