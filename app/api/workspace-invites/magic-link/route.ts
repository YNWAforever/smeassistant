import { NextResponse } from "next/server";
import { sendMagicLink } from "@/lib/identity/composition";
import { membershipRepository } from "@/lib/repositories/membership";
import {
  enforceCompositeIdentifierRateLimit,
  rateLimitUnavailableResponse,
  rateLimitedResponse,
} from "@/lib/security/rate-limit";
import { callbackHref, parseAuthFlow } from "@/lib/identity/sign-in-flow";

/**
 * Sends sign-in mail to pending invitees and returning workspace members.
 * Pending invitations use their recorded recipient; accepted memberships use
 * the mapped app user's current email, never a stale invitation address.
 * /auth/callback independently verifies identity and workspace authorization.
 * Unknown recipients and provider failures retain the same anti-enumeration
 * response. Report-only recipients must use the report's claim entry point.
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

type InviteLinkBody = { email?: unknown; locale?: unknown; returnTo?: unknown; method?: unknown };

export async function POST(req: Request) {
  let body: InviteLinkBody;
  try {
    body = (await req.json()) as InviteLinkBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const flow = parseAuthFlow(new URLSearchParams({
    locale: typeof body.locale === "string" ? body.locale : "",
    returnTo: typeof body.returnTo === "string" ? body.returnTo : "",
    method: typeof body.method === "string" ? body.method : "",
  }));
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

    if (!await membershipRepository.hasSignInMembership(email)) return NextResponse.json({ ok: true });

    const redirect = new URL(callbackHref(flow), appOrigin);

    const { error } = await sendMagicLink({
      email,
      callbackURL: redirect.toString(),
    });
    if (error) {
      console.error("Workspace invite magic-link provider rejected request");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch {
    console.error("Workspace invite magic-link request failed", { category: "magic_link_failed" });
    return NextResponse.json({ ok: true });
  }
}
