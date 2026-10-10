import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/client";
import { isLocale, type Locale } from "@/lib/locale";
import { recoveryAvailable } from "@/lib/mail/feature-flags";
import { recordMailAttempt } from "@/lib/mail/ledger";
import { sendGated } from "@/lib/mail/send-gated";
import { renderRecoveryMail } from "@/lib/mail/templates";
import { createMailTransport } from "@/lib/mail/transport";
import { parseReportSlug } from "@/lib/report-access/slug";
import { createViewerToken } from "@/lib/report-access/token";
import { recordClaimAuditEvent } from "@/lib/repositories/claims";
import { reportRecoveryRepository } from "@/lib/repositories/report-recovery";
import {
  enforceRateLimit,
  enforceRecipientRateLimit,
  rateLimitUnavailableResponse,
  rateLimitedResponse,
} from "@/lib/security/rate-limit";

type RecoverBody = { slug?: unknown; email?: unknown; locale?: unknown };

const MAX_EMAIL_LENGTH = 254;

function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.includes("@") && email.length <= MAX_EMAIL_LENGTH ? email : null;
}

/**
 * Mails a single-use, 60-minute report link to an address that already holds a
 * viewer grant on the report. Anti-enumeration: once the request is well formed
 * and inside both limits, the answer is always exactly `200 { ok: true }` --
 * matched or not, and whatever the repository, provider or ledger did. Errors
 * are logged by category only: repository errors from `pg` can carry key
 * values in `detail`, so neither the error nor the address is ever logged.
 */
export async function POST(req: Request) {
  if (!recoveryAvailable()) return NextResponse.json({ error: "not_enabled" }, { status: 404 });

  let body: RecoverBody;
  try { body = (await req.json()) as RecoverBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const slug = parseReportSlug(body?.slug);
  if (!slug) return NextResponse.json({ error: "slug is invalid" }, { status: 400 });
  const email = normaliseEmail(body.email);
  if (!email) return NextResponse.json({ error: "email is invalid" }, { status: 400 });
  if (!isLocale(body.locale)) return NextResponse.json({ error: "locale is invalid" }, { status: 400 });
  const locale: Locale = body.locale;

  const perIp = await enforceRateLimit({ req, scope: "report_recovery_ip", failClosed: true });
  if (perIp.unavailable) return rateLimitUnavailableResponse();
  if (!perIp.allowed) return rateLimitedResponse(perIp.retryAfterSeconds);
  // Per inbox and report from any network (spec D2), so no IP in this key.
  const perRecipient = await enforceRecipientRateLimit({ req, scope: "report_recovery", identifier: `${email}|${slug}` });
  if (perRecipient.unavailable) return rateLimitUnavailableResponse();
  if (!perRecipient.allowed) return rateLimitedResponse(perRecipient.retryAfterSeconds);

  let match: Awaited<ReturnType<typeof reportRecoveryRepository.findRecipientGrant>> = null;
  try {
    match = await reportRecoveryRepository.findRecipientGrant(slug, email);
    if (match) {
      const { rawToken, tokenHash } = createViewerToken();
      const { grantId } = await reportRecoveryRepository.insertRecoveryGrant(match.jobId, tokenHash);
      const dedupeKey = `recovery:${grantId}`;
      const rendered = renderRecoveryMail(locale, {
        businessName: match.businessName,
        recoverUrl: `${process.env.APP_ORIGIN}/${locale}/r/${slug}/recover?t=${rawToken}`,
      });
      const result = await sendGated({
        transport: createMailTransport(),
        env: process.env,
        message: { to: email, subject: rendered.subject, text: rendered.text, html: rendered.html, dedupeKey },
      });
      try {
        await recordMailAttempt(getPool(), { dedupeKey, workspaceId: match.workspaceId, result, entityType: "report_access_grant", entityId: grantId });
      } catch {
        console.error("[report-access] recovery ledger failed", { category: "mail_ledger_failed" });
      }
    }
  } catch {
    console.error("[report-access] recovery request failed", { category: "recovery_request_failed" });
  }

  await recordClaimAuditEvent({
    workspace_id: match?.workspaceId ?? null,
    actor_type: "system",
    event: "report.recovery_requested",
    entity_type: match ? "audit_job" : null,
    entity_id: match?.jobId ?? null,
    payload: { matched: match !== null, locale },
  });

  return NextResponse.json({ ok: true });
}
