import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { recoveryAvailable } from "@/lib/mail/feature-flags";
import { setViewerGrantCookie } from "@/lib/report-access/cookie";
import { createIdempotencyKey, createViewerToken, hashViewerToken } from "@/lib/report-access/token";
import { recordClaimAuditEvent } from "@/lib/repositories/claims";
import { reportRecoveryRepository } from "@/lib/repositories/report-recovery";
import { enforceRateLimit, rateLimitUnavailableResponse, rateLimitedResponse } from "@/lib/security/rate-limit";

type RedeemBody = { token?: unknown; locale?: unknown };

const MAX_TOKEN_LENGTH = 512;

/**
 * Exchanges a mailed recovery token for a fresh 30-day viewer grant on this
 * device. The repository's conditional UPDATE makes the token single-use; any
 * token that is unknown, already used, revoked or expired answers the same
 * `410 link_expired`. The cookie carries a newly minted viewer token -- never
 * the mailed one -- and the report URL comes from the redeemed grant's job,
 * never from the request.
 */
export async function POST(req: Request) {
  if (!recoveryAvailable()) return NextResponse.json({ error: "not_enabled" }, { status: 404 });

  let body: RedeemBody;
  try { body = (await req.json()) as RedeemBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const token = body?.token;
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH) {
    return NextResponse.json({ error: "token is invalid" }, { status: 400 });
  }
  // Only used to build the redirect URL, so an unknown value falls back rather than failing.
  const locale = isLocale(body.locale) ? body.locale : DEFAULT_LOCALE;

  const limiter = await enforceRateLimit({ req, scope: "report_redeem", failClosed: true });
  if (limiter.unavailable) return rateLimitUnavailableResponse();
  if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);

  const viewer = createViewerToken();
  let redeemed: Awaited<ReturnType<typeof reportRecoveryRepository.redeemRecoveryGrant>>;
  try {
    redeemed = await reportRecoveryRepository.redeemRecoveryGrant(hashViewerToken(token), {
      tokenHash: viewer.tokenHash,
      idempotencyKey: createIdempotencyKey(),
    });
  } catch {
    console.error("[report-access] recovery redeem failed", { category: "recovery_redeem_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!redeemed) return NextResponse.json({ error: "link_expired" }, { status: 410 });

  await recordClaimAuditEvent({
    workspace_id: redeemed.workspaceId,
    actor_type: "system",
    event: "report.recovery_redeemed",
    entity_type: "report_access_grant",
    entity_id: redeemed.grantId,
    payload: { job_id: redeemed.jobId },
  });

  const response = NextResponse.json({ reportUrl: `/${locale}/r/${redeemed.slug}` });
  setViewerGrantCookie(response, redeemed.grantId, viewer.rawToken);
  return response;
}
