// Pinned SDK cookie names. Tokens/challenges are invalidated even on upstream failure.
export const MANAGED_AUTH_COOKIES = [
  "__Secure-neon-auth.session_token",
  "__Secure-neon-auth.local.session_data",
  "__Secure-neon-auth.session_challenge",
  "__Secure-neon-auth.session_challange",
] as const;
export const expiredAuthCookie = { path: "/", maxAge: 0, httpOnly: true, secure: true, sameSite: "lax" as const };
