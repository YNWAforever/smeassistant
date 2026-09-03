import type { NextResponse } from "next/server";
import {
  VIEWER_GRANT_COOKIE,
  encodeViewerGrantCookie,
  parseViewerGrantCookie,
  secureViewerCookieOptions,
} from "./token";

export { VIEWER_GRANT_COOKIE, parseViewerGrantCookie, secureViewerCookieOptions };

export function setViewerGrantCookie(
  response: NextResponse,
  grantId: string,
  rawToken: string,
): NextResponse {
  response.cookies.set(
    VIEWER_GRANT_COOKIE,
    encodeViewerGrantCookie(grantId, rawToken),
    secureViewerCookieOptions,
  );
  return response;
}

export function clearViewerGrantCookie(response: NextResponse): NextResponse {
  response.cookies.set(VIEWER_GRANT_COOKIE, "", {
    ...secureViewerCookieOptions,
    maxAge: 0,
  });
  return response;
}
