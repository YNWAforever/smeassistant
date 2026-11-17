// Instagram (Meta Graph) OAuth for P20.1: consent, code exchange, long-lived
// token refresh and account discovery.
//
// This is the only module that talks to Meta. Every call is injected through a
// transport so tests never reach the network (the same discipline the scan
// engine uses for paid providers). Tokens are returned as plain data; the
// routes encrypt them before they touch the database, and nothing here logs a
// token, secret or provider body.
//
// Scope (Phase 20 plan section 7, P20.1): connect and disconnect only. Nothing
// in this module publishes or reads insights; those arrive in P20.2/P20.3
// behind their own flags.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Pinned Graph API version. Changing it is a deliberate, documented change. */
const DEFAULT_API_VERSION = "v23.0";
/** Consent state lives for ten minutes; the callback must arrive inside it. */
const STATE_TTL_MS = 10 * 60 * 1000;
const MIN_PRODUCTION_SECRET_BYTES = 32;
const DEVELOPMENT_STATE_SECRET = "sme-scanner-development-secret";

/**
 * Requested permissions. `instagram_*` drive the future publishing/insight
 * calls; `pages_show_list` and `pages_read_engagement` are what let the
 * long-lived user token enumerate the Facebook Page that owns the professional
 * Instagram account -- without them `/me/accounts` returns nothing on a user
 * token, so the callback cannot resolve an account at all.
 */
export const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
] as const;

export type InstagramScope = (typeof INSTAGRAM_SCOPES)[number];

export interface InstagramStatePayload {
  workspaceId: string;
  nonce: string;
  issuedAt: number;
  /** UI locale the flow started from, so the callback lands on the right page. */
  locale?: string;
}

export interface InstagramTokens {
  accessToken: string;
  /** ISO timestamp, or null when Meta did not report an expiry. */
  expiresAt: string | null;
  /** Permissions Meta reported as granted for this token. */
  scopes: string[];
}

export interface InstagramAccount {
  /** Instagram professional account id (used by later publishing/insight calls). */
  id: string;
  username: string;
}

export type InstagramExchangeResult =
  | { ok: true; tokens: InstagramTokens; account: InstagramAccount }
  | { ok: false; reason: "unavailable" | "no_instagram_account" | "missing_permissions" };

/** Injectable boundary so tests never touch the network. */
export interface InstagramTransport {
  fetch: typeof fetch;
}

/** The feature flag. Off unless exactly "true", matching the repo's other flags. */
export function instagramOAuthEnabled(): boolean {
  return process.env.INSTAGRAM_OAUTH_ENABLED?.trim() === "true";
}

/**
 * True when the flag is on AND every value the flow needs before it sends a
 * user to Meta is present. Checked before the consent redirect so a half
 * configured environment fails with a plain 503 instead of stranding the owner
 * on Meta's error page.
 */
export function instagramOAuthConfigured(): boolean {
  if (!instagramOAuthEnabled()) return false;
  try {
    stateSigningKey();
  } catch {
    return false;
  }
  return Boolean(
    process.env.INSTAGRAM_APP_ID?.trim() &&
      process.env.INSTAGRAM_APP_SECRET?.trim() &&
      process.env.INSTAGRAM_OAUTH_REDIRECT_URI?.trim(),
  );
}

function apiVersion(): string {
  return process.env.INSTAGRAM_API_VERSION?.trim() || DEFAULT_API_VERSION;
}

/** The Graph version every Instagram call uses; exported for the publish client. */
export function instagramApiVersion(): string {
  return apiVersion();
}

/**
 * Signing key for `state`, derived from the token encryption key with an
 * Instagram-specific domain label rather than reusing it directly. Same
 * production guard as lib/oauth/google-connection.ts: a short or missing key
 * throws in production instead of silently signing with a public constant.
 */
function stateSigningKey(): Buffer {
  const configured = process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim();
  const material = configured ? Buffer.from(configured, "base64") : Buffer.alloc(0);

  if (material.length < MIN_PRODUCTION_SECRET_BYTES) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY must be at least 32 bytes in production");
    }
    return createHmac("sha256", Buffer.from(DEVELOPMENT_STATE_SECRET, "utf8"))
      .update("instagram-oauth-state")
      .digest();
  }

  return createHmac("sha256", material).update("instagram-oauth-state").digest();
}

function sign(body: string): string {
  return createHmac("sha256", stateSigningKey()).update(`instagram:${body}`).digest("base64url");
}

/** `<payload>.<hmac>`; the browser never needs to read it. */
export function signInstagramState(
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
 * Null is the only failure mode: bad signature, mangled payload or an expired
 * state. Callers must treat null as reject. Exactly one "." segment is
 * required, matching verifyState in google-connection.ts.
 */
export function verifyInstagramState(raw: string, now: number = Date.now()): InstagramStatePayload | null {
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body), "utf8");
  const presented = Buffer.from(signature, "utf8");
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as InstagramStatePayload;
    if (!parsed?.workspaceId || !parsed?.nonce || typeof parsed.issuedAt !== "number") return null;
    if (parsed.locale !== undefined && typeof parsed.locale !== "string") return null;
    if (now - parsed.issuedAt > STATE_TTL_MS || parsed.issuedAt > now + 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Facebook Login consent URL. `auth_type=rerequest` matters after a declined
 * permission: without it Meta can return the previous token without
 * re-prompting, which would make a declined scope impossible to recover inside
 * this flow.
 */
export function buildInstagramConsentUrl(state: string): string {
  const url = new URL(`https://www.facebook.com/${apiVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID?.trim() ?? "");
  url.searchParams.set("redirect_uri", process.env.INSTAGRAM_OAUTH_REDIRECT_URI?.trim() ?? "");
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("auth_type", "rerequest");
  return url.toString();
}

function transportFetch(transport?: InstagramTransport): typeof fetch {
  return transport?.fetch ?? fetch;
}

interface JsonResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

async function readJson(fetchImpl: typeof fetch, url: string): Promise<JsonResult> {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: response.ok, status: response.status, body };
  } catch {
    // Log no URL: it carries client_secret/code on the token endpoint. The
    // caller maps this to a content-free outcome code.
    console.error("[instagram-oauth] request failed");
    return { ok: false, status: 0, body: null };
  }
}

function permissionsFrom(accountResponse: JsonResult): { granted: string[]; declined: string[] } | null {
  const data = accountResponse.body?.data;
  if (!Array.isArray(data)) return null;
  const granted: string[] = [];
  const declined: string[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { permission?: unknown; status?: unknown };
    if (typeof row.permission !== "string" || typeof row.status !== "string") continue;
    if (row.status === "granted") granted.push(row.permission);
    else declined.push(row.permission);
  }
  return { granted, declined };
}

/**
 * Resolves the professional Instagram account for the consenting user. The IG
 * account id lives on a Facebook Page (`instagram_business_account`), so this
 * walks the user's pages and takes the first linked account. A workspace that
 * manages several pages is a later decision (Phase 20 plan section 9.4), not
 * something this flow guesses at.
 */
async function resolveAccount(fetchImpl: typeof fetch, accessToken: string): Promise<InstagramAccount | "unavailable" | "no_instagram_account"> {
  const url = new URL(`https://graph.facebook.com/${apiVersion()}/me/accounts`);
  url.searchParams.set("fields", "id,name,instagram_business_account{id,username}");
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", accessToken);
  const result = await readJson(fetchImpl, url.toString());
  if (!result.ok) return "unavailable";
  const data = result.body?.data;
  if (!Array.isArray(data)) return "unavailable";
  for (const page of data) {
    if (!page || typeof page !== "object") continue;
    const linked = (page as { instagram_business_account?: unknown }).instagram_business_account;
    if (!linked || typeof linked !== "object") continue;
    const account = linked as { id?: unknown; username?: unknown };
    if (typeof account.id === "string" && account.id && typeof account.username === "string" && account.username) {
      return { id: account.id, username: account.username };
    }
  }
  return "no_instagram_account";
}

/**
 * Exchanges the consent code for a long-lived user token, checks the granted
 * permissions and resolves the Instagram account. Returns null-free results:
 * every failure is a reason the callback maps to content-free copy.
 */
export async function exchangeInstagramCode(
  code: string,
  options: { transport?: InstagramTransport } = {},
): Promise<InstagramExchangeResult> {
  if (!instagramOAuthConfigured()) return { ok: false, reason: "unavailable" };
  const fetchImpl = transportFetch(options.transport);

  const shortUrl = new URL(`https://graph.facebook.com/${apiVersion()}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!.trim());
  shortUrl.searchParams.set("client_secret", process.env.INSTAGRAM_APP_SECRET!.trim());
  shortUrl.searchParams.set("redirect_uri", process.env.INSTAGRAM_OAUTH_REDIRECT_URI!.trim());
  shortUrl.searchParams.set("code", code);
  const short = await readJson(fetchImpl, shortUrl.toString());
  const shortToken = typeof short.body?.access_token === "string" ? short.body.access_token : "";
  if (!short.ok || !shortToken) return { ok: false, reason: "unavailable" };

  // Long-lived exchange: a short-lived token dies in about two hours, which
  // would make "connected" quietly stop working on the same day.
  const longUrl = new URL(`https://graph.facebook.com/${apiVersion()}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!.trim());
  longUrl.searchParams.set("client_secret", process.env.INSTAGRAM_APP_SECRET!.trim());
  longUrl.searchParams.set("fb_exchange_token", shortToken);
  const long = await readJson(fetchImpl, longUrl.toString());
  const accessToken = typeof long.body?.access_token === "string" ? long.body.access_token : "";
  if (!long.ok || !accessToken) return { ok: false, reason: "unavailable" };
  const expiresIn = typeof long.body?.expires_in === "number" ? long.body.expires_in : null;

  // Granular consent lets the owner uncheck a permission and still return a
  // valid code. Storing that as active would claim a connection whose publishing
  // or insight calls will all fail; refuse, so the page can ask them to retry.
  const permissionsUrl = new URL(`https://graph.facebook.com/${apiVersion()}/me/permissions`);
  permissionsUrl.searchParams.set("access_token", accessToken);
  const permissions = permissionsFrom(await readJson(fetchImpl, permissionsUrl.toString()));
  if (!permissions) return { ok: false, reason: "unavailable" };
  const granted = new Set(permissions.granted);
  const missing = INSTAGRAM_SCOPES.filter((scope) => !granted.has(scope));
  if (missing.length > 0) return { ok: false, reason: "missing_permissions" };

  const account = await resolveAccount(fetchImpl, accessToken);
  if (account === "unavailable") return { ok: false, reason: "unavailable" };
  if (account === "no_instagram_account") return { ok: false, reason: "no_instagram_account" };

  return {
    ok: true,
    tokens: {
      accessToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      scopes: INSTAGRAM_SCOPES.filter((scope) => granted.has(scope)),
    },
    account,
  };
}

/**
 * Extends a long-lived token while it is still valid. Meta's long-lived user
 * tokens can be re-exchanged with `fb_exchange_token` before they expire; the
 * already-long token is sent as the exchange token.
 */
export async function refreshInstagramToken(
  longLivedToken: string,
  options: { transport?: InstagramTransport } = {},
): Promise<InstagramTokens | null> {
  if (!instagramOAuthConfigured()) return null;
  const url = new URL(`https://graph.facebook.com/${apiVersion()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!.trim());
  url.searchParams.set("client_secret", process.env.INSTAGRAM_APP_SECRET!.trim());
  url.searchParams.set("fb_exchange_token", longLivedToken);
  const result = await readJson(transportFetch(options.transport), url.toString());
  const accessToken = typeof result.body?.access_token === "string" ? result.body.access_token : "";
  if (!result.ok || !accessToken) return null;
  const expiresIn = typeof result.body?.expires_in === "number" ? result.body.expires_in : null;
  return {
    accessToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    scopes: [...INSTAGRAM_SCOPES],
  };
}

/** True when the stored token is expired or close enough that a refresh is due. */
export function needsInstagramRefresh(expiresAt: string | null, skewMs = 7 * 24 * 60 * 60 * 1000, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at - now <= skewMs;
}
