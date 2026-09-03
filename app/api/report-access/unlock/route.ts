import { NextResponse } from "next/server";
import { setViewerGrantCookie } from "@/lib/report-access/cookie";
import { createViewerTokenFromIdempotencyKey, isValidIdempotencyKey } from "@/lib/report-access/token";
import { supabaseServer } from "@/lib/supabase/admin";
import { enforceCompositeIdentifierRateLimit, rateLimitUnavailableResponse, rateLimitedResponse } from "@/lib/security/rate-limit";

import { isContactChannelForMarket, normalizeMarketContact } from "@/lib/leads/contact";
import { resolveConsentPolicyVersion } from "@/lib/leads/consent";
import { forwardEventToPostHog, parseScanEvent, resolveAnalyticsSession, setAnalyticsSessionCookie } from "@/lib/analytics/record-event";
const MARKETS = new Set(["hk", "tw"]);
const CHANNELS = new Set(["whatsapp", "line", "phone", "email"]);
const LOCALES = new Set(["en", "zh-HK", "zh-TW"]);
const ANALYTICS_OBJECTIVES = new Set(["more_leads", "better_visibility", "improve_trust", "understand_performance"]);

type UnlockBody = {
  slug?: unknown; market?: unknown; objective?: unknown; business_objective?: unknown;
  preferred_contact_channel?: unknown; preferredContactChannel?: unknown;
  contact_identifier?: unknown; contactIdentifier?: unknown; whatsapp?: unknown; email?: unknown;
  recovery_email?: unknown; recoveryEmail?: unknown;
  locale?: unknown; report_delivery?: unknown; reportDelivery?: unknown;
  scan_discussion?: unknown; scanDiscussion?: unknown; consent_bd_contact?: unknown;
  marketing?: unknown; marketing_consent?: unknown; idempotency_key?: unknown; idempotencyKey?: unknown;
  anonymous_session_id?: unknown;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeContact(channel: string, value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  if (channel === "email") return normalizeEmail(input);
  if (channel === "whatsapp" || channel === "phone") {
    const compact = input.replace(/[\s().-]/g, "");
    return /^\+?\d{8,15}$/.test(compact) ? compact : null;
  }
  if (channel === "line") {
    const lineId = input.replace(/^@+/, "");
    return /^[A-Za-z0-9._-]{2,100}$/.test(lineId) ? lineId : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}


export async function POST(req: Request) {
  let body: UnlockBody;
  try { body = (await req.json()) as UnlockBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const slug = stringValue(body.slug);
  const market = stringValue(body.market)?.toLowerCase() ?? null;
  const objective = stringValue(body.objective ?? body.business_objective);
  const preferredContactChannel = stringValue(body.preferred_contact_channel ?? body.preferredContactChannel)?.toLowerCase() ?? null;
  const rawContact = stringValue(
    body.contact_identifier ?? body.contactIdentifier ??
      (preferredContactChannel === "whatsapp" ? body.whatsapp : undefined) ??
      (preferredContactChannel === "email" ? body.email : undefined),
  );
  const locale = stringValue(body.locale);
  const reportDelivery = booleanValue(body.report_delivery ?? body.reportDelivery);
  const rawScanDiscussion = body.scan_discussion ?? body.scanDiscussion ?? body.consent_bd_contact;
  const rawMarketing = body.marketing ?? body.marketing_consent;
  // These are optional permissions. An omitted value is an explicit opt-out,
  // while a supplied non-boolean value is rejected as malformed input.
  const scanDiscussion = rawScanDiscussion === undefined ? false : booleanValue(rawScanDiscussion);
  const marketing = rawMarketing === undefined ? false : booleanValue(rawMarketing);
  const recoveryEmailValue = stringValue(body.recovery_email ?? body.recoveryEmail);
  const idempotencyKey = stringValue(body.idempotency_key ?? body.idempotencyKey);

  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(slug)) return NextResponse.json({ error: "slug is invalid" }, { status: 400 });
  if (!market || !MARKETS.has(market)) return NextResponse.json({ error: "market must be hk or tw" }, { status: 400 });
  if (!objective || objective.length > 160) return NextResponse.json({ error: "objective is required" }, { status: 400 });
  if (!preferredContactChannel || !CHANNELS.has(preferredContactChannel)) return NextResponse.json({ error: "preferred_contact_channel is invalid" }, { status: 400 });
  if (!rawContact) return NextResponse.json({ error: "contact_identifier is required" }, { status: 400 });
  if (!locale || !LOCALES.has(locale)) return NextResponse.json({ error: "locale is invalid" }, { status: 400 });
  if (reportDelivery !== true) return NextResponse.json({ error: "report_delivery must be true" }, { status: 400 });
  if (scanDiscussion === null || marketing === null) return NextResponse.json({ error: "consent values must be booleans" }, { status: 400 });
  const normalizedRecoveryEmail = recoveryEmailValue ? normalizeEmail(recoveryEmailValue) : null;
  if (recoveryEmailValue && !normalizedRecoveryEmail) return NextResponse.json({ error: "recovery_email is invalid" }, { status: 400 });
  if (!idempotencyKey) return NextResponse.json({ error: "idempotency_key is required" }, { status: 400 });
  if (!isValidIdempotencyKey(idempotencyKey)) return NextResponse.json({ error: "idempotency_key must be a 32-byte base64url value" }, { status: 400 });

  const limiter = await enforceCompositeIdentifierRateLimit({
    req,
    scope: "report_unlock",
    identifier: slug,
    failClosed: true,
  });
  if (limiter.unavailable) return rateLimitUnavailableResponse();
  if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);

  const supabase = supabaseServer();
  const { data: job, error: jobError } = await supabase.from("audit_jobs").select("id, share_slug, region, business_objective").eq("share_slug", slug).single();
  if (jobError || !job) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const jobRegion = (job as { region?: string | null }).region;
  const contactMarket: "HK" | "TW" = jobRegion === "tw" ? "TW" : jobRegion === "hk" ? "HK" : market.toUpperCase() as "HK" | "TW";
  if (!isContactChannelForMarket(contactMarket, preferredContactChannel)) {
    return NextResponse.json(
      { error: "preferred_contact_channel is invalid for report market", market: contactMarket },
      { status: 400 },
    );
  }
  const normalizedContact = normalizeMarketContact({ market: contactMarket, channel: preferredContactChannel, identifier: rawContact });
  if (!normalizedContact) return NextResponse.json({ error: "contact_identifier is invalid" }, { status: 400 });
  const contactIdentifier = normalizedContact.identifier;
  const recoveryEmail = normalizedRecoveryEmail ?? (preferredContactChannel === "email" ? contactIdentifier : null);
  const storedObjective = (job as { business_objective?: string | null }).business_objective;
  const effectiveObjective = storedObjective?.trim() || objective;


  const effectiveIdempotencyKey = idempotencyKey;
  const { rawToken, tokenHash } = createViewerTokenFromIdempotencyKey(effectiveIdempotencyKey);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const session = resolveAnalyticsSession(req);
  const analyticsObjective = ANALYTICS_OBJECTIVES.has(effectiveObjective) ? effectiveObjective : "other";
  const unlockEvent = parseScanEvent({
    name: "report_unlocked",
    properties: { market: contactMarket, channel: preferredContactChannel, objective: analyticsObjective },
  });
  const eventProperties = unlockEvent.properties;
  const { data: unlockData, error: unlockError } = await supabase.rpc("complete_report_unlock", {
    p_job_id: job.id,
    p_whatsapp: preferredContactChannel === "whatsapp" ? contactIdentifier : null,
    p_email: preferredContactChannel === "email" ? contactIdentifier : null,
    p_recovery_email: recoveryEmail,
    p_preferred_contact_channel: preferredContactChannel,
    p_contact_identifier: contactIdentifier,
    p_business_objective: effectiveObjective,
    p_report_delivery_consent: reportDelivery,
    p_scan_discussion_consent: scanDiscussion,
    p_marketing_consent: marketing,
    p_policy_version: resolveConsentPolicyVersion(process.env.REPORT_CONSENT_POLICY_VERSION),
    p_locale: locale,
    p_token_hash: tokenHash,
    p_idempotency_key: effectiveIdempotencyKey,
    p_purpose: "viewer_report",
    p_expires_at: expiresAt,
    p_anonymous_session_id: session.id,
    p_event_properties: eventProperties,
  });
  if (unlockError || !unlockData?.[0]?.grant_id) return NextResponse.json({ error: "Failed to unlock report" }, { status: 500 });

  const result = unlockData[0] as { lead_id: string; grant_id: string; event_created?: boolean };
  if (result.event_created === true) {
    void forwardEventToPostHog(unlockEvent, session.id).catch(() => {
      console.error("[analytics] event_record_failed", { category: "provider_unavailable" });
    });
  }
  const response = NextResponse.json({ ok: true, reportUrl: `/${locale}/r/${slug}` });
  setViewerGrantCookie(response, result.grant_id, rawToken);
  setAnalyticsSessionCookie(response, session);
  return response;
}
