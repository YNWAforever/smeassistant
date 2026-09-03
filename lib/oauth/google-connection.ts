// Google Business Profile OAuth: consent, exchange, refresh.
//
// The only module that talks to Google. Everything it returns is plain data, so
// the routes stay thin and this stays testable.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
const STATE_TTL_MS = 10 * 60 * 1000;
const DEVELOPMENT_STATE_SECRET = "sme-scanner-development-secret";
const MIN_PRODUCTION_SECRET_BYTES = 32;
export const GBP_SCOPE_REQUIRED = GBP_SCOPE;

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
}

export interface OAuthStatePayload {
  workspaceId: string;
  nonce: string;
  issuedAt: number;
  /**
   * smeassistant addition: the UI locale the flow was started from, so the
   * callback can redirect to `/{locale}/owner/...` (every route in this app is
   * locale-prefixed, unlike upstream's unprefixed /owner). Optional so an
   * upstream-shaped state still verifies; the callback falls back to
   * DEFAULT_LOCALE when it is absent or not a supported locale.
   */
  locale?: string;
}

/**
 * Includes the encryption key deliberately. Without it the consent flow still
 * redirects to Google, the merchant grants business.manage on a live account,
 * and the callback then dies at encryptToken with nothing persisted — and
 * because prompt=consent is set, every retry re-prompts and fails identically.
 * This predicate is the only place that can refuse before the user is sent away.
 */
export function googleOAuthConfigured(): boolean {
  try {
    stateSigningKey();
  } catch {
    return false;
  }
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim(),
  );
}

/**
 * The claim flow needs its own authorized redirect URI
 * (GOOGLE_OAUTH_CLAIM_REDIRECT_URI): buildConsentUrl/exchangeCode always
 * defaulted to GOOGLE_OAUTH_REDIRECT_URI, which points at the connect flow's
 * callback (/api/oauth/google/callback) -- that predates this flow and is the
 * only one that existed. Sending a real user through the claim start route
 * without this set would bounce them to the connect callback, which runs
 * verifyState (not verifyClaimState) on a "claim"-domain signed state; the
 * domain-separated HMAC mismatches and the claim callback never executes.
 * An unset claim redirect uri is the same bug moved from a wrong-URI failure
 * to a missing-env-var one, so this must fail closed the same way
 * googleOAuthConfigured() does for the connect flow's own config.
 */
export function googleOAuthClaimConfigured(): boolean {
  return googleOAuthConfigured() && Boolean(process.env.GOOGLE_OAUTH_CLAIM_REDIRECT_URI?.trim());
}

/**
 * Signing key for `state`, derived from the token encryption key with a domain
 * label rather than reusing it directly. One secret to manage, but a signing
 * oracle here can never be turned into a decryption key.
 */
function stateSigningKey(): Buffer {
  const configured = process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim();
  const material = configured ? Buffer.from(configured, "base64") : Buffer.alloc(0);

  // Must throw in production exactly as token-crypto's encryptionKey() does.
  // It previously fell back to DEVELOPMENT_STATE_SECRET — a constant published
  // in this repository — so on any deploy missing the key, every state was
  // signed with a value anyone could compute and forge for an arbitrary
  // workspaceId. Note Buffer.from(x, "base64") never throws: it silently
  // returns a short buffer for a passphrase containing spaces or '!', which
  // took that same path.
  if (material.length < MIN_PRODUCTION_SECRET_BYTES) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY must be at least 32 bytes in production");
    }
    return createHmac("sha256", Buffer.from(DEVELOPMENT_STATE_SECRET, "utf8"))
      .update("google-oauth-state")
      .digest();
  }

  return createHmac("sha256", material).update("google-oauth-state").digest();
}

/**
 * Domain-separated so the connect flow's and the claim flow's states can never
 * be cryptographically interchangeable, even if their payload shapes ever
 * stopped being disjoint by accident. Without the domain tag, both flows sign
 * with the exact same key and label ("google-oauth-state"), so a connect-flow
 * signature is a fully valid signature as far as the claim verifier's crypto
 * is concerned -- the only thing stopping a leaked connect state from
 * verifying as a claim state would then be the type guard, which is an
 * accident of field naming, not a designed barrier.
 */
function sign(body: string, domain: "connect" | "claim" = "connect"): string {
  return createHmac("sha256", stateSigningKey()).update(`${domain}:${body}`).digest("base64url");
}

/**
 * Test-only escape hatch onto `sign`'s domain tagging. Not used by any
 * production code path -- signState/signClaimState/verifyState/
 * verifyClaimState are the only real callers of `sign`. Exists solely so
 * google-connection.test.ts can pin the HMAC domain separation between the
 * connect and claim flows directly: sign a claim-shaped payload under the
 * "connect" domain and prove verifyClaimState still rejects it, which the
 * type guard alone could not distinguish from "the domain tag was silently
 * removed."
 */
export function signForTest(body: string, domain: "connect" | "claim"): string {
  return sign(body, domain);
}

/**
 * `<payload>.<hmac>` — opaque to the browser, verifiable on return.
 *
 * `locale` (smeassistant addition) is only written into the payload when
 * given, so the signed body for a call without it is byte-identical to
 * upstream's.
 */
export function signState(
  workspaceId: string,
  nonce: string = randomBytes(16).toString("base64url"),
  locale?: string,
): string {
  const body = Buffer.from(
    JSON.stringify({ workspaceId, nonce, issuedAt: Date.now(), ...(locale ? { locale } : {}) }),
    "utf8",
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Returns null for anything not provably ours and current: a bad signature, a
 * mangled payload, or one older than the TTL. Null is the only failure mode the
 * caller has to handle, and it always means "reject".
 *
 * Requires exactly one "." separator, matching verifyClaimState: `raw.split(".")`
 * alone would silently ignore anything past the second segment
 * (`"<state>.junk"` would decode identically to `"<state>"`).
 */
export function verifyState(raw: string, now: number = Date.now()): OAuthStatePayload | null {
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body), "utf8");
  const presented = Buffer.from(signature, "utf8");
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false.
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
    if (!parsed?.workspaceId || !parsed?.nonce || typeof parsed.issuedAt !== "number") return null;
    if (parsed.locale !== undefined && typeof parsed.locale !== "string") return null;
    if (now - parsed.issuedAt > STATE_TTL_MS || parsed.issuedAt > now + 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface ClaimStatePayload {
  jobId: string;
  placeId: string;
  /**
   * The report's share_slug, carried through the signed state so the callback
   * has somewhere to redirect back to on failure. Most failures return before
   * the job row (which does have share_slug) is ever read, and the merchant
   * going through this flow by definition has no workspace yet -- so without
   * this, every outcome (failure or success) was invisible to them, landing on
   * /owner's "no workspace linked" empty state instead of the report they
   * started from.
   */
  slug: string;
  nonce: string;
  issuedAt: number;
  /** smeassistant addition; see OAuthStatePayload.locale. */
  locale?: string;
}

/**
 * Real narrowing rather than a cast -- the compiler proves the shape instead of
 * being told it. The `issuedAt` clause is the only one never reachable from
 * the public API (`signClaimState` always stamps `Date.now()`), so it's
 * untested defence in depth, deliberately left in rather than dropped.
 */
function isClaimStatePayload(value: unknown): value is ClaimStatePayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.jobId === "string" &&
    typeof v.placeId === "string" &&
    typeof v.slug === "string" &&
    typeof v.nonce === "string" &&
    typeof v.issuedAt === "number" &&
    (v.locale === undefined || typeof v.locale === "string")
  );
}

/**
 * A sibling to signState/verifyState, not a variant of them. The connect flow's
 * state carries a workspaceId because a workspace already exists at that point;
 * the claim flow's state carries a jobId + placeId + slug because no workspace
 * exists yet -- the whole point is that one gets created only after the
 * callback verifies ownership. `slug` rides along so the callback can redirect
 * back to the report (`/r/{slug}`) on every outcome, success or failure: the
 * merchant going through this flow has no workspace by definition, so a
 * fallback destination like `/owner` would show its "no workspace linked"
 * empty state instead of ever surfacing the outcome. Keeping these as two
 * separate functions with two separate
 * payload shapes, signed under a separate HMAC domain ("claim" vs "connect" --
 * see `sign`), means a leaked or replayed state from one flow can never be
 * mistaken for the other at the cryptographic layer, not merely because the
 * two payload shapes happen to be disjoint today -- and the working
 * connect-flow code is untouched.
 *
 * This state is replayable for the full STATE_TTL_MS window: unlike the
 * connect callback, which re-checks live workspace membership independently of
 * the state itself, nothing here enforces single use, and the claim callback
 * route (app/api/oauth/google/claim/callback/route.ts) does NOT dedupe on
 * `payload.nonce` either. That is deliberate, not an oversight -- and it is
 * specific to this flow's write pattern, not a blanket claim that state
 * replay is always safe:
 *   - attachJobToWorkspace's conditional write (`.is("workspace_id", null)`)
 *     already makes a replayed, already-successful claim a safe no-op: the
 *     second run finds the job already attached and short-circuits before any
 *     further write.
 *   - a replayed authorization *code* (as opposed to this state) is single-use
 *     at Google's end regardless -- Google's token endpoint rejects a second
 *     exchange of the same code -- so replaying the state alone, without a
 *     fresh code from a fresh consent, cannot even reach the callback's write
 *     path.
 * A future caller of this state with a different write pattern (one where a
 * second successful run is NOT a no-op) would need real nonce dedup; don't
 * assume this reasoning transfers.
 *
 * `jobId` is not validated as a UUID-shaped string here. The only minter is
 * Task 5's claim-start route, which sources it from a real `audit_jobs` row,
 * so a malformed value reaching this function would mean that invariant broke
 * elsewhere. If `signClaimState` ever gains another caller, validate at the
 * call site rather than adding it here.
 */
export function signClaimState(
  jobId: string,
  placeId: string,
  slug: string,
  nonce: string = randomBytes(16).toString("base64url"),
  locale?: string,
): string {
  const body = Buffer.from(
    JSON.stringify({ jobId, placeId, slug, nonce, issuedAt: Date.now(), ...(locale ? { locale } : {}) }),
    "utf8",
  ).toString("base64url");
  return `${body}.${sign(body, "claim")}`;
}

/**
 * Same rejection contract as verifyState: null means reject, always.
 *
 * Requires exactly one "." separator: `raw.split(".")` alone would silently
 * ignore anything past the second segment (`"<state>.junk"` would decode
 * identically to `"<state>"`), which would defeat nonce-based single-use
 * dedup if a caller ever tried to key it on the raw token string instead.
 */
export function verifyClaimState(raw: string, now: number = Date.now()): ClaimStatePayload | null {
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body, "claim"), "utf8");
  const presented = Buffer.from(signature, "utf8");
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false.
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!isClaimStatePayload(parsed)) return null;
    if (now - parsed.issuedAt > STATE_TTL_MS || parsed.issuedAt > now + 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * `redirectUri` defaults to GOOGLE_OAUTH_REDIRECT_URI (the connect flow's
 * callback) so the connect flow's two existing call sites need no changes.
 * The claim start route passes GOOGLE_OAUTH_CLAIM_REDIRECT_URI explicitly --
 * Google requires the token-exchange redirect_uri to byte-match the one used
 * at authorization, so the two flows cannot share a redirect target.
 */
export function buildConsentUrl(state: string, redirectUri?: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "");
  url.searchParams.set("redirect_uri", (redirectUri ?? process.env.GOOGLE_OAUTH_REDIRECT_URI)?.trim() ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GBP_SCOPE);
  // offline + consent together are what produce a refresh token. Without
  // prompt=consent Google omits it on any repeat authorisation, and the
  // connection silently becomes single-use — working today, dead next month.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

function toTokenSet(payload: Record<string, unknown>): GoogleTokenSet | null {
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) return null;
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : null;
  return {
    accessToken,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
  };
}

async function postToken(body: URLSearchParams): Promise<GoogleTokenSet | null> {
  try {
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      // Google's body echoes the client_secret on some misconfigurations, so it
      // is never logged.
      console.error(`[google-oauth] token endpoint returned ${resp.status}`);
      return null;
    }
    return toTokenSet((await resp.json()) as Record<string, unknown>);
  } catch (error) {
    console.error("[google-oauth] token request failed", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

/**
 * `redirectUri` defaults to GOOGLE_OAUTH_REDIRECT_URI, same reasoning as
 * buildConsentUrl: the claim callback passes GOOGLE_OAUTH_CLAIM_REDIRECT_URI
 * explicitly so the redirect_uri here byte-matches the one used to build the
 * consent URL that produced `code`, as Google requires.
 */
export async function exchangeCode(code: string, redirectUri?: string): Promise<GoogleTokenSet | null> {
  if (!googleOAuthConfigured()) return null;
  return postToken(
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
      redirect_uri: (redirectUri ?? process.env.GOOGLE_OAUTH_REDIRECT_URI)!.trim(),
      grant_type: "authorization_code",
    }),
  );
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenSet | null> {
  if (!googleOAuthConfigured()) return null;
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
      grant_type: "refresh_token",
    }),
  );
}

/** True when the stored token is expired or close enough that a refresh is due. */
export function needsRefresh(expiresAt: string | null, skewMs = 5 * 60 * 1000, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at - now <= skewMs;
}
