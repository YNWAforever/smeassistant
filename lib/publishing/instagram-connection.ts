import "server-only";

import { refreshInstagramToken, needsInstagramRefresh } from "@/lib/oauth/instagram-connection";
import { InstagramGraphError } from "@/lib/oauth/instagram-graph";
import {
  instagramConnectionRepository,
  parseInstagramAccountRef,
  type InstagramAccountRef,
} from "@/lib/repositories/instagram-connection";
import { decryptToken, encryptToken } from "@/lib/security/token-crypto";

/**
 * The publish-time reader of the sealed Instagram tokens in `oauth_connections`
 * (P20.2). Mirrors lib/publishing/connection.ts for Google:
 *
 * - No `active` row, a missing account ref, or a row without
 *   `instagram_basic` + `instagram_content_publish`: `connection_missing`.
 * - A token due for refresh is refreshed once before `fn` runs; the new token
 *   is re-sealed and stored under the workspace lock. A refresh that yields
 *   nothing marks the row `expired`: `connection_expired`.
 * - An `InstagramGraphError("unauthorized")` from `fn` on a token that was not
 *   just refreshed buys one refresh and one retry. A second `unauthorized` (or
 *   one on a just-refreshed token) marks the row `expired`.
 * - Every other error from `fn` is rethrown unchanged; the caller decides
 *   whether a write may have landed.
 * - A stored token that cannot be unsealed is a deployment fault, not a broken
 *   merchant connection: it throws a plain `Error("token_unreadable")` and
 *   leaves the row as it is.
 *
 * Tokens live only in local variables here. They are handed to `fn` and to
 * `refresh`, and are never logged, returned or put in an error.
 */

export type InstagramConnectionFailure = "connection_missing" | "connection_expired";

export class InstagramConnectionError extends Error {
  constructor(readonly code: InstagramConnectionFailure) {
    super(code);
    this.name = "InstagramConnectionError";
  }
}

type ConnectionRepository = Pick<
  ReturnType<typeof instagramConnectionRepository>,
  "activeConnection" | "storeRefreshedToken" | "markConnectionExpired"
>;

export type InstagramAccessTokenDeps = {
  repository?: ConnectionRepository;
  refresh?: typeof refreshInstagramToken;
  now?: () => number;
};

/** Permissions a feed publish needs; both are requested at connect time. */
export const INSTAGRAM_PUBLISH_SCOPES = ["instagram_basic", "instagram_content_publish"] as const;

/** Unseals a stored token; any failure becomes a token-free `token_unreadable`. */
function unseal(sealed: string): string {
  try {
    return decryptToken(sealed);
  } catch {
    throw new Error("token_unreadable");
  }
}

export async function withInstagramAccessToken<T>(
  workspaceId: string,
  fn: (accessToken: string, account: InstagramAccountRef) => Promise<T>,
  deps: InstagramAccessTokenDeps = {},
): Promise<T> {
  const repository = deps.repository ?? instagramConnectionRepository();
  const refresh = deps.refresh ?? refreshInstagramToken;
  const now = deps.now ?? Date.now;

  const connection = await repository.activeConnection(workspaceId);
  const account = parseInstagramAccountRef(connection?.accountRef ?? null);
  if (!connection || !account || !INSTAGRAM_PUBLISH_SCOPES.every((scope) => connection.scopes.includes(scope))) {
    throw new InstagramConnectionError("connection_missing");
  }

  const expire = async (): Promise<never> => {
    await repository.markConnectionExpired(connection.id);
    throw new InstagramConnectionError("connection_expired");
  };

  const renew = async (): Promise<string> => {
    // A Facebook long-lived user token is refreshed by re-exchanging itself;
    // P20.1 stores no separate refresh token.
    const tokens = await refresh(unseal(connection.accessTokenEncrypted));
    if (!tokens) return expire();
    const stored = await repository.storeRefreshedToken({
      workspaceId,
      connectionId: connection.id,
      accessTokenEncrypted: encryptToken(tokens.accessToken),
      expiresAt: tokens.expiresAt,
    });
    if (!stored) return expire();
    return tokens.accessToken;
  };

  const justRefreshed = needsInstagramRefresh(connection.expiresAt, undefined, now());
  const first = justRefreshed ? await renew() : unseal(connection.accessTokenEncrypted);

  try {
    return await fn(first, account);
  } catch (error) {
    if (!(error instanceof InstagramGraphError) || error.code !== "unauthorized") throw error;
    if (justRefreshed) return expire();
  }

  const second = await renew();
  try {
    return await fn(second, account);
  } catch (error) {
    if (error instanceof InstagramGraphError && error.code === "unauthorized") return expire();
    throw error;
  }
}
