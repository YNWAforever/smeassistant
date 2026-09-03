/** Codes the auth callback (app/auth/callback) sends back on `?error=` (Phase 2 contract). Server-safe: no "use client". */
export type SignInErrorCode = "missing_code" | "invalid_code" | "not_authorized" | "auth_unavailable";

const KNOWN_ERRORS: ReadonlySet<string> = new Set(["missing_code", "invalid_code", "not_authorized", "auth_unavailable"]);

export function isSignInErrorCode(value: string | undefined): value is SignInErrorCode {
  return Boolean(value && KNOWN_ERRORS.has(value));
}
