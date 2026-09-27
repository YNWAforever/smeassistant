import { NextResponse } from "next/server";

import { getPool } from "@/lib/db/client";
import { resolveUnsubscribeSecret, verifyUnsubscribeToken } from "@/lib/mail/unsubscribe-token";
import { mailOutboxRepository } from "@/lib/repositories/mail-outbox";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";

function response(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function methodNotAllowed(): NextResponse {
  return response({ error: "method_not_allowed" }, 405);
}

export function GET(): NextResponse {
  return methodNotAllowed();
}

/**
 * The token travels either in the query string -- RFC 8058 one-click: a mail
 * client POSTs here with `?token=` and a body of `List-Unsubscribe=One-Click`,
 * which carries no token of its own -- or in a JSON body, from the
 * /unsubscribe page's confirm button. The query string always wins when both
 * could apply, so a one-click POST never has to parse its form body at all.
 */
async function extractToken(req: Request): Promise<string | null> {
  const queryToken = new URL(req.url).searchParams.get("token");
  if (queryToken) return queryToken;
  try {
    const body = (await req.json()) as { token?: unknown };
    return typeof body?.token === "string" ? body.token : null;
  } catch {
    return null;
  }
}

/**
 * One-click, per-member unsubscribe (docs/superpowers/specs/2026-09-27-mail-
 * outbox-design.md §5). No session: the signed token is the only credential.
 * Every failure -- a bad signature, an expired link, a token whose member has
 * since left the workspace (Review Focus 5) -- answers the same neutral
 * `invalid_link`, so nothing here can be used to enumerate members or
 * workspaces. The limiter runs fail-open (global-constraints.md departure 3):
 * a limiter outage must not stop someone leaving a mailing.
 */
export async function POST(req: Request): Promise<Response> {
  const limiter = await enforceRateLimit({ req, scope: "mail_unsubscribe", failClosed: false });
  if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);

  const secret = resolveUnsubscribeSecret();
  if (!secret) return response({ error: "unavailable" }, 503);

  const token = await extractToken(req);
  const payload = token ? verifyUnsubscribeToken(token, secret) : null;
  if (!payload) return response({ error: "invalid_link" }, 400);

  let result: { member: boolean };
  try {
    result = await mailOutboxRepository(getPool()).optOut(payload.userId, payload.workspaceId, payload.kind);
  } catch {
    return response({ error: "unavailable" }, 503);
  }
  if (!result.member) return response({ error: "invalid_link" }, 400);

  return response({ ok: true });
}
