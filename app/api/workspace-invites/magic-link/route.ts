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
 * Sends an invited team member a magic link that returns through
 * /auth/callback (upstream: /auth/owner/callback), which unconditionally binds any pending
 * workspace_members row for the verified email (see bindPendingMembership in
 * lib/workspace/callback-queries.ts).
 *
 * Cannot reuse POST /api/owner/magic-link: that route only mails an address
 * already recorded as a leads.email row tied to a specific report's
 * share_slug, which an invited teammate has no reason to have. This route's
 * equivalent bound is "a pending workspace_members row exists for this
 * email" -- checked before mailing, same anti-enumeration shape (uniform
 * { ok: true } regardless of match).
 */
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

type InviteLinkBody = { email?: unknown; locale?: unknown; returnTo?: unknown };

export async function POST(req: Request) {
  let body: InviteLinkBody;
  try {
    body = (await req.json()) as InviteLinkBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const locale = isLocale(body.locale) ? body.locale : DEFAULT_LOCALE;
  const returnTo = safeReturnTo(typeof body.returnTo === "string" ? body.returnTo : null);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const limiter = await enforceCompositeIdentifierRateLimit({
    req,
    scope: "workspace_invite_magic_link",
    identifier: email,
    failClosed: true,
  });
  if (limiter.unavailable) return rateLimitUnavailableResponse();
  if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);

  try {
    // See app/api/owner/magic-link/route.ts for why NEXT_PUBLIC_SITE_URL is
    // validated and the request origin is only the fallback.
    const appOrigin = safeAppOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? new URL(req.url).origin;

    const { data: pendingRows } = await supabaseServer()
      .from("workspace_members")
      .select("id")
      .eq("email", email)
      .is("accepted_at", null)
      .limit(1);
    if (!pendingRows?.length) return NextResponse.json({ ok: true });

    const redirect = new URL("/auth/callback", appOrigin);
    redirect.searchParams.set("locale", locale);
    if (returnTo) redirect.searchParams.set("returnTo", returnTo);

    const client = await createSupabaseServerClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect.toString() },
    });
    if (error) {
      console.error("Workspace invite magic-link provider rejected request");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Workspace invite magic-link request failed", error);
    return NextResponse.json({ ok: true });
  }
}
