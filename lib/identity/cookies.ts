// Pinned SDK cookie names. Tokens/challenges are invalidated even on upstream failure.
export const MANAGED_AUTH_COOKIES = [
  "__Secure-neon-auth.session_token",
  "__Secure-neon-auth.local.session_data",
  "__Secure-neon-auth.session_challenge",
  "__Secure-neon-auth.session_challange",
] as const;
/**
 * The signed-in session only. A failed magic-link callback expires these but
 * keeps the challenge cookies: every link request overwrites the one challenge,
 * so it belongs to the newest link, and clearing it on an older link's failure
 * would make that still-valid newer link fail too.
 */
export const MANAGED_SESSION_COOKIES = [
  "__Secure-neon-auth.session_token",
  "__Secure-neon-auth.local.session_data",
] as const;
export const expiredAuthCookie = { path: "/", maxAge: 0, httpOnly: true, secure: true, sameSite: "lax" as const };
