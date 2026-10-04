import "server-only";

import { GBP_SCOPE_REQUIRED, needsRefresh, refreshAccessToken } from "@/lib/oauth/google-connection";
import { GbpError } from "@/lib/oauth/google-reviews";
import { publishingRepository } from "@/lib/repositories/publishing";
import { decryptToken, encryptToken } from "@/lib/security/token-crypto";

/**
 * The one production reader of the sealed Google Business Profile tokens in
 * `oauth_connections` (spec §2.3, §5).
 *
 * - No `active` row, or one without `business.manage`: `connection_missing`.
 * - An access token due for refresh is refreshed once before `fn` runs; the new
 *   token is re-sealed and stored under the workspace lock. A refresh that
 *   yields nothing marks the row `expired`: `connection_expired`.
 * - A `GbpError("unauthorized")` from `fn` on a token that was not just
 *   refreshed buys one refresh and one retry. A second `unauthorized` (or one
 *   on a just-refreshed token) marks the row `expired`: `connection_expired`.
 * - A `GbpError("forbidden")` never changes the row (ruling P3); it and every
 *   other error from `fn` are rethrown unchanged.
 * - A stored token that cannot be unsealed (corrupt row, wrong or missing key)
 *   is a deployment fault, not a broken merchant connection: it throws a plain
 *   `Error("token_unreadable")` and leaves the row as it is.
 *
 * Tokens live only in local variables here. They are handed to `fn` and to
 * `refresh`, and are never logged, returned or put in an error.
 */

export type ConnectionFailure = "connection_missing" | "connection_expired";

export class GbpConnectionError extends Error {
  constructor(readonly code: ConnectionFailure) {
    super(code);
  }
}
Object.defineProperty(GbpConnectionError.prototype, "name", {
  value: "GbpConnectionError",
  writable: true,
  configurable: true,
});

type ConnectionRepository = Pick<
  ReturnType<typeof publishingRepository>,
  "activeGbpConnection" | "storeRefreshedToken" | "markConnectionExpired"
>;

export type GbpAccessTokenDeps = {
  repository?: ConnectionRepository;
  refresh?: typeof refreshAccessToken;
  now?: () => number;
};

/** Unseals a stored token; any failure becomes a token-free `token_unreadable`. */
function unseal(sealed: string): string {
  try {
    return decryptToken(sealed);
  } catch {
    throw new Error("token_unreadable");
  }
}

const isUnauthorized = (error: unknown): boolean => error instanceof GbpError && error.code === "unauthorized";

export async function withGbpAccessToken<T>(
  workspaceId: string,
  fn: (accessToken: string) => Promise<T>,
  deps: GbpAccessTokenDeps = {},
): Promise<T> {
  const repository = deps.repository ?? publishingRepository();
  const refresh = deps.refresh ?? refreshAccessToken;
  const now = deps.now ?? Date.now;

  const connection = await repository.activeGbpConnection(workspaceId);
  if (!connection || !connection.scopes.includes(GBP_SCOPE_REQUIRED)) {
    throw new GbpConnectionError("connection_missing");
  }

  const expire = async (): Promise<never> => {
    await repository.markConnectionExpired(connection.id);
    throw new GbpConnectionError("connection_expired");
  };

  const renew = async (): Promise<string> => {
    if (connection.refreshTokenEncrypted === null) return expire();
    const tokens = await refresh(unseal(connection.refreshTokenEncrypted));
    if (!tokens) return expire();
    // Google normally omits a new refresh token on refresh; the stored one is kept.
    await repository.storeRefreshedToken({
      connectionId: connection.id,
      workspaceId,
      accessTokenEncrypted: encryptToken(tokens.accessToken),
      expiresAt: tokens.expiresAt,
    });
    return tokens.accessToken;
  };

  const justRefreshed = needsRefresh(connection.expiresAt, undefined, now());
  const first = justRefreshed ? await renew() : unseal(connection.accessTokenEncrypted);

  try {
    return await fn(first);
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    if (justRefreshed) return expire();
  }

  const second = await renew();
  try {
    return await fn(second);
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    return expire();
  }
}
