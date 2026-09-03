import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { supabaseServer } from "@/lib/supabase/admin";
import { completeWorkspaceClaim, isValidTimezone, type ClaimMarket } from "@/lib/workspace/claim";

/**
 * POST /api/workspaces/claim (CLAUDE.md §3.2.3).
 *
 * Completes a workspace whose job was already attached by an OAuth-verified
 * claim or a staff assignment: locations, brand profile, usage row, snapshot
 * and actions hooks. It never attaches a job (guardrail 15); that decision
 * lives in the OAuth claim callback. Idempotent, so onboarding may retry.
 *
 * Body (snake_case per §3.2.3; the camelCase spellings are accepted too so
 * a client using the TypeScript input type does not silently 400):
 *   { claim_slug, workspace_name, primary_location: { name, address? }, market, timezone?, locale? }
 */
const SLUG_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_NAME = 160;
const MAX_ADDRESS = 500;

type ParsedBody = {
  claimSlug: string;
  workspaceName: string;
  primaryLocation: { name: string; address: string | null };
  market: ClaimMarket;
  timezone: string | null;
  locale: string;
};

function pick(body: Record<string, unknown>, snake: string, camel: string): unknown {
  return body[snake] !== undefined ? body[snake] : body[camel];
}

function limitedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

export function parseClaimBody(raw: unknown): { ok: true; body: ParsedBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "body must be an object" };
  const body = raw as Record<string, unknown>;

  const claimSlug = limitedString(pick(body, "claim_slug", "claimSlug"), 64);
  if (!claimSlug || !SLUG_RE.test(claimSlug)) return { ok: false, error: "claim_slug is invalid" };

  const workspaceName = limitedString(pick(body, "workspace_name", "workspaceName"), MAX_NAME);
  if (!workspaceName) return { ok: false, error: "workspace_name is required" };

  const location = pick(body, "primary_location", "primaryLocation");
  if (!location || typeof location !== "object" || Array.isArray(location)) {
    return { ok: false, error: "primary_location is required" };
  }
  const locationRecord = location as Record<string, unknown>;
  const locationName = limitedString(locationRecord.name, MAX_NAME);
  if (!locationName) return { ok: false, error: "primary_location.name is required" };
  const rawAddress = locationRecord.address;
  if (rawAddress != null && rawAddress !== "" && typeof rawAddress !== "string") {
    return { ok: false, error: "primary_location.address is invalid" };
  }
  const address = typeof rawAddress === "string" ? limitedString(rawAddress, MAX_ADDRESS) : null;
  if (typeof rawAddress === "string" && rawAddress.trim() && !address) {
    return { ok: false, error: "primary_location.address is invalid" };
  }

  const market = typeof body.market === "string" ? body.market.toLowerCase() : "";
  if (market !== "hk" && market !== "tw") return { ok: false, error: "market must be hk or tw" };

  const rawTimezone = body.timezone;
  if (rawTimezone != null && rawTimezone !== "" && !isValidTimezone(rawTimezone)) {
    return { ok: false, error: "timezone is invalid" };
  }
  const timezone = isValidTimezone(rawTimezone) ? rawTimezone : null;

  const locale = isLocale(body.locale) ? body.locale : DEFAULT_LOCALE;

  return {
    ok: true,
    body: { claimSlug, workspaceName, primaryLocation: { name: locationName, address }, market, timezone, locale },
  };
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseClaimBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Fail closed: this endpoint writes several tables; a missing limiter must
  // not turn it into an unbounded write path.
  const limit = await enforceRateLimit({ req, scope: "workspace_claim", identifiers: [user.id], failClosed: true });
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  try {
    const result = await completeWorkspaceClaim(supabaseServer(), { ...parsed.body, userId: user.id });
    switch (result.kind) {
      case "completed":
        return NextResponse.json({ ok: true, workspaceSlug: result.workspaceSlug, locationId: result.locationId });
      case "not_found":
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      case "forbidden":
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      case "not_attached":
        // The job exists but ownership has not been proven yet: the caller
        // must go through the OAuth claim (or ask Fimmick) first.
        return NextResponse.json({ error: "not_attached" }, { status: 409 });
    }
  } catch (error) {
    console.error("[api/workspaces/claim] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
