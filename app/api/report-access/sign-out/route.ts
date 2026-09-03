import { NextResponse } from "next/server";
import { clearViewerGrantCookie, parseViewerGrantCookie, VIEWER_GRANT_COOKIE } from "@/lib/report-access/cookie";
import { hashViewerToken } from "@/lib/report-access/token";
import { supabaseServer } from "@/lib/supabase/admin";

/**
 * Ends a viewer's report session on this device, and revokes the grant behind it.
 *
 * Clearing the cookie alone would be theatre. The grant lasts 30 days, so anyone
 * who captured the cookie value keeps access for the remainder of it — which is
 * exactly the shared-or-borrowed-device case this exists for. `authorizeReport`
 * already rejects on `revoked_at != null`, so revocation needs no new
 * authorization logic.
 *
 * The revoke is matched on the token hash as well as the grant id, so presenting
 * someone else's grant id does not revoke their session.
 *
 * Unauthenticated by design: presenting the cookie is the only thing being asked,
 * and the worst a forged call can do is revoke a grant the caller already holds.
 * Always answers 200 — whether a grant was found is not something an
 * unauthenticated caller should be able to probe for, and "you are signed out" is
 * true either way.
 */
export async function POST(req: Request) {
  const raw = req.headers.get("cookie") ?? "";
  const value = raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${VIEWER_GRANT_COOKIE}=`))
    ?.slice(VIEWER_GRANT_COOKIE.length + 1);
  // decodeURIComponent throws URIError on a malformed escape such as "%zz", and
  // the cookie header is attacker-controlled. An unhandled throw here would turn
  // a junk cookie into a 500 on a route whose entire job is to always succeed.
  let decoded: string | null = null;
  if (value) {
    try { decoded = decodeURIComponent(value); }
    catch { decoded = value; }
  }
  const presented = parseViewerGrantCookie(decoded);

  if (presented) {
    try {
      const { error } = await supabaseServer()
        .from("report_access_grants")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", presented.grantId)
        .eq("token_hash", hashViewerToken(presented.rawToken))
        .is("revoked_at", null);
      if (error) {
        // Logged, not surfaced. The cookie is cleared below either way, so the
        // caller is signed out on this device; what is lost is revocation of a
        // token they still hold, which is the state they were in before asking.
        console.error("[report-access] sign-out revoke failed", { category: "grant_revoke_failed" });
      }
    } catch {
      console.error("[report-access] sign-out revoke failed", { category: "grant_revoke_failed" });
    }
  }

  const response = NextResponse.json({ ok: true });
  return clearViewerGrantCookie(response);
}
