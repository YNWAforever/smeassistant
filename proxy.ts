import { getNeonAuth } from "@/lib/identity/neon";
import { NextResponse, NextRequest } from "next/server";

import {
  LOCALE_HEADER,
  isOwnerGatedPath,
  localeFromPathname,
  resolveLegacyRedirect,
  resolveLocaleRedirect,
  signInRedirectFor,
} from "@/lib/funnel/locale-redirect";

/** Locale routing and fresh managed-session gate; application routes enforce membership. */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const legacy = resolveLegacyRedirect(pathname);
  if (legacy) {
    const url = request.nextUrl.clone();
    url.pathname = legacy;
    return NextResponse.redirect(url, 308);
  }
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
  let managed: NextResponse | undefined;
  try {
    // The SDK accepts a signed cache without checking upstream revocation.
    // Omit only that optimization on this validation clone; preserve tokens,
    // original URL and locale. No internal query flag reaches navigation.
    const validationHeaders = new Headers(headers);
    validationHeaders.set("cookie", (headers.get("cookie") ?? "").split(";")
      .filter(part => part.trim().split("=")[0] !== "__Secure-neon-auth.local.session_data").join(";"));
    managed = await getNeonAuth().middleware({ loginUrl: loginUrl.toString() })(
      new NextRequest(request.url, { headers: validationHeaders }),
    );
    if (managed.headers.get("x-middleware-next") === "1") {
      for (const cookie of managed.cookies.getAll()) response.cookies.set(cookie);
      return response;
    }
  } catch {
    // Missing config and transport failures are signed-out decisions.
  }
  const denied = NextResponse.redirect(loginUrl, 307);
  if (managed) for (const cookie of managed.cookies.getAll()) denied.cookies.set(cookie);
  return denied;
}

export const config = {
  matcher: ["/((?!api|auth/|_next|_vercel|opengraph-image|twitter-image|icon|apple-icon|.*\\..*).*)"],
};
