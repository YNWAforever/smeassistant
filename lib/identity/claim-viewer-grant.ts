import "server-only";

import { cookies } from "next/headers";

import { reportsRepository } from "@/lib/repositories/reports";
import { parseViewerGrantCookie, VIEWER_GRANT_COOKIE } from "@/lib/report-access/cookie";
import { tokenHashMatches } from "@/lib/report-access/token";

/**
 * True only when the caller presents the non-revoked, unexpired viewer grant
 * issued for this exact job. A cookie from another report never grants a claim.
 */
export async function holdsViewerGrant(jobId: string): Promise<boolean> {
  const raw = (await cookies()).get(VIEWER_GRANT_COOKIE)?.value;
  const presented = raw ? parseViewerGrantCookie(raw) : null;
  if (!presented) return false;
  const data = await reportsRepository().findViewerGrant(jobId, presented.grantId);
  if (!data || data.job_id !== jobId || data.revoked_at != null) return false;
  const expiry = Date.parse(data.expires_at);
  return Number.isFinite(expiry) && expiry > Date.now() && tokenHashMatches(presented.rawToken, data.token_hash);
}
