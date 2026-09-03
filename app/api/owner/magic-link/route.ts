import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseServer } from "@/lib/supabase/admin";
import {
  enforceCompositeIdentifierRateLimit,
  rateLimitUnavailableResponse,
  rateLimitedResponse,
} from "@/lib/security/rate-limit";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { safeReturnTo } from "@/lib/funnel/locale-redirect";

/**
 * Sends the owner a magic link that returns through /auth/callback
 * carrying the slug they are claiming (upstream: /auth/owner/callback).
 * Local additions: the optional `locale` and `returnTo` body fields are
 * validated and carried on the link so the callback can land on a
 * locale-prefixed page.
 *
 * Additive rather than a change to the unlock route: unlock already works, and
 * account creation is an offer made after it, not a step inside it. A failure
 * here must never be able to break unlocking.
 *
 * The slug is carried, not trusted. Entitlement is decided by claimScan once a
 * session exists; this endpoint only addresses an email.
 */
const SLUG_RE = /^[A-Za-z0-9_-]{6,64}$/;

/** Mirrors the staff route: reject credentials, path, query and fragment. */
function safeAppOrigin(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

type MagicLinkBody = { email?: unknown; slug?: unknown; locale?: unknown; returnTo?: unknown };

export async function POST(req: Request) {
  let body: MagicLinkBody;
  try {
    body = (await req.json()) as MagicLinkBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const locale = isLocale(body.locale) ? body.locale : DEFAULT_LOCALE;
  const returnTo = safeReturnTo(typeof body.returnTo === "string" ? body.returnTo : null);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  // Slug is now REQUIRED. It is what bounds who can be mailed: without it this
  // endpoint sent Supabase auth mail to any address a caller named, and the
  // outer rate-limit bucket allows ~1000 sends/hour per fingerprint, so one IP
  // could spray hundreds of unrelated third parties from the project's sender.
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }

  // failClosed: an email sender that cannot be rate limited is an email sender
  // that can be pointed at arbitrary addresses.
  const limiter = await enforceCompositeIdentifierRateLimit({
    req,
    scope: "owner_magic_link",
    identifier: email,
    failClosed: true,
  });
  if (limiter.unavailable) return rateLimitUnavailableResponse();
  if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);

  try {
    // NEXT_PUBLIC_SITE_URL (this app's canonical origin, see lib/share.ts) when
    // it is set, since this value ends up in the link the owner clicks.
    // Validated the way upstream validates APP_ORIGIN, not consumed raw: a
    // value without a scheme makes `new URL` throw (every owner then sees
    // "check your email" and no link ever arrives), and embedded credentials
    // would be mailed to every owner inside emailRedirectTo. Without the env
    // (local dev, preview deployments) the request origin is used; Supabase
    // Auth still refuses any redirect origin not on its allowlist.
    const appOrigin = safeAppOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? new URL(req.url).origin;

    // Only addresses already recorded as a lead on THIS report may be mailed.
    // That does not prove ownership — leads.email is writable by anyone through
    // the public unlock endpoint, which is why claiming itself is gated (see
    // claim-scan.ts) — but it does stop the endpoint being a general-purpose
    // mailer pointed at arbitrary third parties.
    const { data: job } = await supabaseServer()
      .from("audit_jobs")
      .select("id")
      .eq("share_slug", slug)
      .maybeSingle();
    if (!job) return NextResponse.json({ ok: true });

    const { data: known } = await supabaseServer()
      .from("leads")
      .select("id")
      .eq("job_id", job.id)
      .eq("email", email)
      .limit(1);
    if (!known?.length) return NextResponse.json({ ok: true });

    const redirect = new URL("/auth/callback", appOrigin);
    redirect.searchParams.set("claim", slug);
    redirect.searchParams.set("locale", locale);
    if (returnTo) redirect.searchParams.set("returnTo", returnTo);

    const client = await createSupabaseServerClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      // shouldCreateUser stays true (default): owners are always new Supabase
      // Auth users, and setting it false would make signup impossible. The
      // open-mailer problem is bounded above instead, by refusing to mail an
      // address that is not already a lead on the named report -- the staff
      // route bounds the same problem with its FIMMICK_STAFF_EMAILS allowlist.
      options: { emailRedirectTo: redirect.toString() },
    });
    if (error) {
      console.error("Owner magic-link provider rejected request");
      return NextResponse.json({ ok: true });
    }

    // One response shape regardless of outcome, so this cannot be used to
    // enumerate which merchants already have accounts.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Owner magic-link request failed", error);
    return NextResponse.json({ ok: true });
  }
}
