import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import type { IdentityProvider } from "./contracts";

let auth: ReturnType<typeof createNeonAuth> | undefined;

/** Configuration and SDK construction are deferred until a server request. */
export function getNeonAuth(): ReturnType<typeof createNeonAuth> {
  if (auth) return auth;
  try {
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!baseUrl || !cookieSecret || cookieSecret.length < 32) throw new Error();
    const url = new URL(baseUrl);
    const loopbackTest = process.env.NODE_ENV === "test"
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopbackTest))
      || url.username || url.password || url.search || url.hash
    ) throw new Error();
    const config = { baseUrl, cookieSecret };
    // Prevent SDK diagnostics from leaking provider URLs or session material.
    auth = createNeonAuth({
      baseUrl: config.baseUrl,
      cookies: { secret: config.cookieSecret },
      logLevel: "silent",
    });
    return auth;
  } catch {
    throw new Error("identity_config_invalid");
  }
}

export const neonIdentityProvider: IdentityProvider = {
  async getIdentity() {
    const server = getNeonAuth();
    let result: Awaited<ReturnType<typeof server.getSession>>;
    try {
      // In SDK 0.5.0-beta the string "true" bypasses the local signed cookie
      // cache and checks upstream revocation. A boolean does not bypass it.
      result = await server.getSession({ query: { disableCookieCache: "true" } });
    } catch {
      throw new Error("identity_session_failed");
    }
    const { data: session, error } = result;
    if (error) {
      if (error.status === 401 || error.status === 403) return null;
      throw new Error("identity_session_failed");
    }
    const user = session?.user;
    const details = session?.session;
    if (
      !user || !details || user.emailVerified !== true
      || typeof user.id !== "string" || !user.id.trim()
      || typeof user.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
      || details.userId !== user.id
    ) return null;
    const expiry = details.expiresAt;
    const expiresAt = expiry instanceof Date ? expiry.getTime()
      : typeof expiry === "string" ? Date.parse(expiry) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return { provider: "neon", subject: user.id, email: user.email, verified: true };
  },
  async signOut() {
    const server = getNeonAuth();
    try {
      const result = await server.signOut();
      if (result?.error) throw new Error();
    } catch {
      throw new Error("identity_signout_failed");
    }
  },
};
