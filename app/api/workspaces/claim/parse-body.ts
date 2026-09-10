import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { BRAND_VOICES } from "@/lib/workspace/brand";
import { isValidTimezone, type ClaimMarket } from "@/lib/workspace/claim";

/**
 * Body parsing for POST /api/workspaces/claim.
 *
 * It lives beside `route.ts` rather than inside it because Next.js allows a
 * route file to export only the HTTP method handlers and its known config
 * values -- and type-checks that during `next build`. This function is covered
 * directly by route.test.ts, so it has to be importable.
 *
 * Field names are snake_case per CLAUDE.md 3.2.3; the camelCase spellings are
 * accepted too, so a client using the TypeScript input type does not silently
 * 400.
 */
const SLUG_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_NAME = 160;
const MAX_ADDRESS = 500;

export type ParsedBody = {
  claimSlug: string;
  workspaceName: string;
  primaryLocation: { name: string; address: string | null };
  market: ClaimMarket;
  timezone: string | null;
  locale: string;
  brandVoice: string | null;
  approvedClaims: string[] | null;
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

  // Onboarding step 4's brand basics. These were already being POSTed and
  // silently dropped, leaving an empty default brand_profiles row. An
  // unrecognised voice or a malformed claims list is ignored rather than
  // rejected, so an older client cannot start 400-ing on a field it has
  // always sent; validation is against the real BRAND_VOICES set, which the
  // onboarding UI's own local union did not match.
  const rawVoice = limitedString(pick(body, "brand_voice", "brandVoice"), 32);
  const brandVoice = rawVoice && (BRAND_VOICES as readonly string[]).includes(rawVoice) ? rawVoice : null;
  const rawClaims = pick(body, "approved_claims", "approvedClaims");
  const approvedClaims = Array.isArray(rawClaims)
    ? rawClaims.map((claim) => limitedString(claim, 200)).filter((claim): claim is string => Boolean(claim)).slice(0, 20)
    : null;

  return {
    ok: true,
    body: {
      claimSlug, workspaceName, primaryLocation: { name: locationName, address }, market, timezone, locale,
      brandVoice, approvedClaims: approvedClaims?.length ? approvedClaims : null,
    },
  };
}
