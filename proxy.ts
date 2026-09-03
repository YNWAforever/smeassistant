import { NextResponse, type NextRequest } from "next/server";

import { LOCALE_HEADER, localeFromPathname, resolveLocaleRedirect } from "@/lib/funnel/locale-redirect";

/**
 * Next 16 request interception (the file formerly called middleware.ts).
 *
 * 1. Any page path without a locale prefix is redirected (307) to its zh-HK
 *    twin, search string preserved: "/scan?market=tw" → "/zh-HK/scan?market=tw".
 * 2. Locale-prefixed requests continue with an `x-sme-locale` request header so
 *    the root layout can render the correct <html lang> without reading params
 *    it cannot see.
 *
 * Route handlers (/api, /auth), Next internals and static files never reach
 * this function: the matcher below excludes them, and resolveLocaleRedirect
 * repeats the rule so the decision stays unit-testable (tests/proxy.test.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|auth/|_next|_vercel|.*\\..*).*)"],
};
