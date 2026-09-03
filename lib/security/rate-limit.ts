import { supabaseServer } from "@/lib/supabase/admin";
import {
  hmacFingerprint,
  RateLimitConfigurationError,
  requestFingerprint,
} from "./request-fingerprint";

export type RateLimitScope =
  | "scan_start"
  | "business_search"
  | "ig_search"
  | "scan_process"
  | "scan_status"
  | "report_unlock"
  | "composite_identifier_outer"
  | "report_recovery"
  | "staff_magic_link"
  | "owner_magic_link"
  | "workspace_invite_magic_link"
  | "staff_otp_verify"
  | "staff_lead_contact"
  | "staff_erasure"
  | "staff_consent_withdrawal"
  | "staff_fix_pack_generate"
  | "workspace_claim"
  | "action_run"
  | "action_mutation"
  | "asset_upload"
  | "assistant_run";

export const RATE_LIMITS: Record<RateLimitScope, { limit: number; windowSeconds: number }> = {
  scan_start: { limit: 10, windowSeconds: 60 * 60 },
  business_search: { limit: 60, windowSeconds: 60 * 60 },
  // Deliberately tighter than business_search. The merchant picker searches on
  // a debounce as the user types; the Instagram picker fires once per confirmed
  // GBP candidate plus explicit retries, so a legitimate session needs a
  // handful, not sixty. Both are per session x source-IP HMAC.
  ig_search: { limit: 20, windowSeconds: 60 * 60 },
  scan_process: { limit: 20, windowSeconds: 60 * 60 },
  scan_status: { limit: 120, windowSeconds: 60 * 60 },
  report_unlock: { limit: 5, windowSeconds: 60 * 60 },
  composite_identifier_outer: { limit: 1000, windowSeconds: 60 * 60 },
  staff_magic_link: { limit: 5, windowSeconds: 60 * 60 },
  // Same budget as the staff link: this endpoint sends mail to an address the
  // caller supplies, so it is a spam vector before it is anything else.
  owner_magic_link: { limit: 5, windowSeconds: 60 * 60 },
  // Same shape as owner_magic_link: the caller supplies an arbitrary address,
  // and the route only refuses to mail it if no pending workspace_members row
  // exists -- so this is still a spam-vector budget, not an authorization
  // check.
  workspace_invite_magic_link: { limit: 5, windowSeconds: 60 * 60 },
  // The manual-code fallback for staff sign-in (some corporate mail security
  // scanners prefetch and consume the magic link before the staff member
  // clicks it, so they fall back to typing the emailed 6-digit code
  // instead). This bounds guesses against a live code, not requests for one:
  // 10 attempts against 1,000,000 possibilities is a negligible brute-force
  // budget even before Supabase's own per-token attempt limit applies.
  staff_otp_verify: { limit: 10, windowSeconds: 60 * 60 },
  report_recovery: { limit: 5, windowSeconds: 60 * 60 },
  // Staff are allowlisted and email-verified, so this is not about distrusting
  // them. enforceRateLimit keys the bucket on `identifiers` (staff.email here)
  // plus requestFingerprint(req) — an HMAC of the caller's source IP — so the
  // real budget is per staff email x source IP, not per session; there is no
  // session identifier in the key. It bounds the *rate* of one-lead-at-a-time
  // contact disclosures from a given staff account and network origin, not the
  // total that account can ever pull: a caller who rotates source IPs, or who
  // simply waits out the hourly window, gets a fresh budget each time.
  staff_lead_contact: { limit: 60, windowSeconds: 60 * 60 },
  // Erasure is irreversible and staff-triggered one report at a time, so this is
  // a blast-radius bound rather than an abuse bound: it caps how much a single
  // mistaken script or a compromised staff session can destroy in an hour. Keyed
  // like staff_lead_contact on staff email x source IP, with the same caveat --
  // a caller who waits out the window gets a fresh budget. Deliberately lower
  // than the disclosure limit: reading 60 contacts is recoverable, erasing 60
  // reports is not.
  staff_erasure: { limit: 20, windowSeconds: 60 * 60 },
  // Its own bucket, deliberately not shared with staff_lead_contact. Withdrawal
  // is the protective action: a merchant asking to stop being contacted must not
  // be refused because staff spent the hour's disclosure quota reading other
  // people's numbers. Generous for the same reason -- the failure mode of a tight
  // limit here is continuing to contact someone who asked you to stop.
  staff_consent_withdrawal: { limit: 120, windowSeconds: 60 * 60 },
  // Staff-authenticated, so this is a runaway-cost guard against repeat
  // clicks (each call spends real LLM tokens), not an abuse boundary.
  staff_fix_pack_generate: { limit: 20, windowSeconds: 60 * 60 },
  // POST /api/workspaces/claim (this app). Session-authenticated and
  // idempotent, so this is a runaway-write guard per user (keyed on the
  // session user id plus the source-IP HMAC), not an abuse boundary:
  // completing a claim writes locations/brand_profiles/workspace_usage and
  // a burst of retries from a stuck onboarding step should not hammer them.
  workspace_claim: { limit: 10, windowSeconds: 60 * 60 },
  // Phase 4 workspace mutations (CLAUDE.md §3.2.3), keyed per session user
  // plus the source-IP HMAC. action_run spends real LLM tokens on every call,
  // so it is a runaway-cost guard like staff_fix_pack_generate; the other two
  // are runaway-write guards for a stuck editor or upload form, not abuse
  // boundaries (authorizeWorkspaceRequest is the boundary).
  action_run: { limit: 30, windowSeconds: 60 * 60 },
  action_mutation: { limit: 120, windowSeconds: 60 * 60 },
  asset_upload: { limit: 30, windowSeconds: 60 * 60 },
  // POST /api/assistant/run in live mode (CLAUDE.md §3.8), keyed per session
  // user plus the source-IP HMAC. Template intents are cheap reads but the
  // draft intents spend LLM tokens, so this is a runaway-cost guard sized for a
  // chatty sheet session (one question a minute), not an abuse boundary.
  assistant_run: { limit: 60, windowSeconds: 60 * 60 },
};

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  unavailable?: boolean;
}

export class RateLimitUnavailableError extends Error {
  constructor(message = "Rate limiter is unavailable") {
    super(message);
    this.name = "RateLimitUnavailableError";
  }
}

type RateLimitClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

/** Bucket keys are made entirely from scope names and HMAC digests. */
export function rateLimitBucketKey(scope: RateLimitScope, ...identifiers: string[]): string {
  return [scope, ...identifiers.map((identifier) => hmacFingerprint(identifier))].join(":");
}

/** Consume one token through the atomic Postgres RPC. */
export async function consumeRateLimit({
  client,
  bucketKey,
  limit,
  windowSeconds,
}: {
  client: RateLimitClient;
  bucketKey: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitDecision> {
  if (!bucketKey || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new RateLimitUnavailableError("Invalid rate-limit policy");
  }

  const { data, error } = await client.rpc("consume_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new RateLimitUnavailableError(error.message ?? "consume_rate_limit failed");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new RateLimitUnavailableError("Invalid limiter response");
  const result = row as { allowed?: unknown; retry_after_seconds?: unknown };
  if (typeof result.allowed !== "boolean") throw new RateLimitUnavailableError("Invalid limiter decision");
  const retryAfterSeconds = Number.isFinite(Number(result.retry_after_seconds))
    ? Math.max(1, Math.ceil(Number(result.retry_after_seconds)))
    : windowSeconds;
  return { allowed: result.allowed, retryAfterSeconds };
}

/**
 * Apply a policy to one request. For public scan flows the caller can choose
 * fail-open when the limiter is down; unlock and staff auth must pass
 * `failClosed: true` so a missing limiter never exposes a mutation boundary.
 */
export async function enforceRateLimit({
  req,
  scope,
  identifiers = [],
  client,
  failClosed,
}: {
  req: Request;
  scope: RateLimitScope;
  identifiers?: string[];
  client?: RateLimitClient;
  failClosed: boolean;
}): Promise<RateLimitDecision> {
  const policy = RATE_LIMITS[scope];
  try {
    const key = rateLimitBucketKey(scope, ...identifiers, requestFingerprint(req));
    const dbClient = client ?? (supabaseServer() as unknown as RateLimitClient);
    return await consumeRateLimit({ client: dbClient, bucketKey: key, ...policy });
  } catch (error) {
    // Route tests do not provide Supabase credentials. Keep them hermetic;
    // deployed routes still fail closed for required policies.
    if ((process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.argv.some((arg) => arg.includes("vitest"))) && !process.env.NEXT_PUBLIC_SUPABASE_URL && !client) {
      return { allowed: true, retryAfterSeconds: 1, unavailable: true };
    }
    if (!(error instanceof RateLimitConfigurationError)) {
      console.error("Rate limiter unavailable", error);
    }
    return {
      allowed: !failClosed,
      retryAfterSeconds: policy.windowSeconds,
      unavailable: true,
    };
  }
}

type CompositeIdentifierScope =
  | "scan_process"
  | "scan_status"
  | "report_unlock"
  | "report_recovery"
  | "staff_magic_link"
  | "owner_magic_link"
  | "workspace_invite_magic_link"
  | "staff_otp_verify";

/**
 * Bound attacker-controlled identifier cardinality with one per-scope bucket
 * before consuming the route's exact identifier-plus-fingerprint bucket.
 */
export async function enforceCompositeIdentifierRateLimit({
  req,
  scope,
  identifier,
  client,
  failClosed,
}: {
  req: Request;
  scope: CompositeIdentifierScope;
  identifier: string;
  client?: RateLimitClient;
  failClosed: boolean;
}): Promise<RateLimitDecision> {
  const outer = await enforceRateLimit({
    req,
    scope: "composite_identifier_outer",
    // Keyed per inner scope, not once per caller. Sharing one bucket across
    // every composite scope let benign traffic starve the mutation routes: the
    // scanning page polls scan_status on a 1s->8s backoff, so a single scan
    // spends ~25-30 of the 1000/hour budget that also gates report_unlock,
    // owner_magic_link and staff_magic_link. Behind one egress IP -- carrier
    // CGNAT or an office NAT, the normal case for the HK/TW SMEs this serves --
    // roughly 35-40 scans an hour locked every unrelated visitor out of
    // unlocking their own report. The cardinality bound this exists for is
    // unaffected: `identifier` still never reaches this key.
    identifiers: [scope],
    client,
    failClosed,
  });
  if (!outer.allowed || outer.unavailable) return outer;
  return enforceRateLimit({ req, scope, identifiers: [identifier], client, failClosed });
}

export function rateLimitedResponse(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(Math.max(1, Math.ceil(retryAfterSeconds))),
    },
  });
}

export function rateLimitUnavailableResponse(): Response {
  return new Response(JSON.stringify({ error: "rate_limit_unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json", "retry-after": "60" },
  });
}
