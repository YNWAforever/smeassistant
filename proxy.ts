import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  LOCALE_HEADER,
  isOwnerGatedPath,
  isOwnerPath,
  localeFromPathname,
  resolveLocaleRedirect,
  signInRedirectFor,
} from "@/lib/funnel/locale-redirect";

/**
 * Next 16 request interception (the file formerly called middleware.ts).
 *
 * 1. Any page path without a locale prefix is redirected (307) to its zh-HK
 *    twin, search string preserved: "/scan?market=tw" → "/zh-HK/scan?market=tw".
 * 2. Locale-prefixed requests continue with an `x-sme-locale` request header so
 *    the root layout can render the correct <html lang> without reading params
 *    it cannot see.
 * 3. Under `/{locale}/owner` the Supabase session is refreshed with
 *    @supabase/ssr (the standard request/response cookie plumbing, so a rotated
 *    refresh token reaches the browser), and every page except sign-in requires
 *    a user: signed-out visitors get a 307 to
 *    `/{locale}/owner/sign-in?returnTo=<path+search>` (Phase 2 contract).
 *    Server components re-check with lib/auth.ts — the proxy is a convenience
 *    redirect, never the authority (CLAUDE.md guardrail 9).
 *
 * Route handlers (/api, /auth), Next internals and static files never reach
 * this function: the matcher below excludes them, and resolveLocaleRedirect
 * repeats the rule so the decision stays unit-testable (tests/proxy.test.ts).
 */

let warnedMissingSupabaseEnv = false;

function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) return { url, anonKey };
  if (!warnedMissingSupabaseEnv) {
    warnedMissingSupabaseEnv = true;
    console.warn("[proxy] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY unset; owner routes are not gated");
  }
  return null;
}

/** Test seam: forget the one-time warning so a suite can assert it. */
export function resetProxyWarnings(): void {
  warnedMissingSupabaseEnv = false;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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
  let response = NextResponse.next({ request: { headers } });

  if (!isOwnerPath(pathname)) return response;

  const env = supabaseEnv();
  // Without Supabase env (local dev, e2e fixtures) there is no session to
  // refresh and nothing to gate; the page-level guards still fail closed.
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers } });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  let signedIn = false;
  try {
    // getUser (not getSession) so the token is verified against Supabase Auth,
    // which is also what refreshes an expired session through setAll above.
    const { data, error } = await supabase.auth.getUser();
    signedIn = !error && Boolean(data.user?.id);
  } catch {
    // Auth unavailable reads as signed out; the sign-in page is the safe landing.
    signedIn = false;
  }

  if (!signedIn && isOwnerGatedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    const [redirectPath, redirectQuery = ""] = signInRedirectFor(locale, pathname, search).split("?");
    redirectUrl.pathname = redirectPath;
    redirectUrl.search = redirectQuery ? `?${redirectQuery}` : "";
    const redirect = NextResponse.redirect(redirectUrl, 307);
    // Keep any refreshed auth cookies on the redirect so the session is not lost.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|auth/|_next|_vercel|opengraph-image|twitter-image|icon|apple-icon|.*\\..*).*)"],
};
