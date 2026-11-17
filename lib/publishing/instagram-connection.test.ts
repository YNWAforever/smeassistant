import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real repository is never reached: every test injects a fake.
vi.mock("@/lib/db/client", () => ({
  getPool: () => {
    throw new Error("default_database_forbidden");
  },
}));

import type { InstagramTokens } from "@/lib/oauth/instagram-connection";
import { InstagramGraphError } from "@/lib/oauth/instagram-graph";
import { decryptToken, encryptToken } from "@/lib/security/token-crypto";
import {
  INSTAGRAM_PUBLISH_SCOPES,
  InstagramConnectionError,
  withInstagramAccessToken,
} from "./instagram-connection";

const KEY = Buffer.alloc(32, 7).toString("base64");
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONNECTION = "22222222-2222-4222-8222-222222222222";

const OLD_ACCESS = "IGQVJold-access-token-PLAINTEXT";
const NEW_ACCESS = "IGQVJnew-access-token-PLAINTEXT";

const NOW = Date.parse("2026-11-18T00:00:00Z");
const FRESH = new Date(NOW + 60 * 24 * 60 * 60 * 1000).toISOString();
const EXPIRING = new Date(NOW + 60 * 1000).toISOString();
const NEW_EXPIRY = new Date(NOW + 60 * 24 * 60 * 60 * 1000).toISOString();

const ACCOUNT_REF = JSON.stringify({ id: "17841400000000000", username: "eldage" });

type Refresh = (token: string) => Promise<InstagramTokens | null>;

type Row = {
  id: string;
  accountRef: string | null;
  accessTokenEncrypted: string;
  scopes: string[];
  expiresAt: string | null;
};

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: CONNECTION,
    accountRef: ACCOUNT_REF,
    accessTokenEncrypted: encryptToken(OLD_ACCESS),
    scopes: [...INSTAGRAM_PUBLISH_SCOPES],
    expiresAt: FRESH,
    ...overrides,
  };
}

function fakeRepository(connection: Row | null) {
  return {
    activeConnection: vi.fn(async () => connection),
    storeRefreshedToken: vi.fn(async (_input: {
      workspaceId: string;
      connectionId: string;
      accessTokenEncrypted: string;
      expiresAt: string | null;
    }) => true),
    markConnectionExpired: vi.fn(async (_connectionId: string) => {}),
  };
}

function tokens(access = NEW_ACCESS): InstagramTokens {
  return { accessToken: access, expiresAt: NEW_EXPIRY, scopes: [...INSTAGRAM_PUBLISH_SCOPES] };
}

const savedKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = KEY;
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  else process.env.OAUTH_TOKEN_ENCRYPTION_KEY = savedKey;
});

describe("withInstagramAccessToken", () => {
  it("fails closed when there is no active connection", async () => {
    const repository = fakeRepository(null);
    await expect(withInstagramAccessToken(WORKSPACE, async () => "ok", { repository })).rejects.toEqual(
      new InstagramConnectionError("connection_missing"),
    );
  });

  it("fails closed when the account ref or a publish scope is missing", async () => {
    // Older/partial rows (wrong account JSON, no content-publish permission)
    // must not become a publish attempt.
    const noAccount = fakeRepository(row({ accountRef: null }));
    await expect(withInstagramAccessToken(WORKSPACE, async () => "ok", { repository: noAccount })).rejects.toMatchObject({ code: "connection_missing" });

    const noScope = fakeRepository(row({ scopes: ["instagram_basic"] }));
    await expect(withInstagramAccessToken(WORKSPACE, async () => "ok", { repository: noScope })).rejects.toMatchObject({ code: "connection_missing" });
  });

  it("hands the token and parsed account to the caller without refreshing a fresh token", async () => {
    const repository = fakeRepository(row());
    const refresh = vi.fn<Refresh>();
    const seen: Array<{ token: string; account: unknown }> = [];

    await withInstagramAccessToken(WORKSPACE, async (token, account) => {
      seen.push({ token, account });
      return "ok";
    }, { repository, refresh, now: () => NOW });

    expect(refresh).not.toHaveBeenCalled();
    expect(seen).toEqual([{ token: OLD_ACCESS, account: { id: "17841400000000000", username: "eldage" } }]);
  });

  it("refreshes an expiring token once, stores the sealed replacement, and uses it", async () => {
    const repository = fakeRepository(row({ expiresAt: EXPIRING }));
    const refresh = vi.fn<Refresh>(async () => tokens());
    const seen: string[] = [];

    await withInstagramAccessToken(WORKSPACE, async (token) => {
      seen.push(token);
      return "ok";
    }, { repository, refresh, now: () => NOW });

    expect(refresh).toHaveBeenCalledWith(OLD_ACCESS);
    expect(repository.storeRefreshedToken).toHaveBeenCalledTimes(1);
    const stored = repository.storeRefreshedToken.mock.calls[0][0];
    expect(stored.connectionId).toBe(CONNECTION);
    expect(stored.workspaceId).toBe(WORKSPACE);
    expect(decryptToken(stored.accessTokenEncrypted)).toBe(NEW_ACCESS);
    // The plaintext never travels to the repository.
    expect(stored.accessTokenEncrypted).not.toContain(NEW_ACCESS);
    expect(seen).toEqual([NEW_ACCESS]);
  });

  it("marks the connection expired when the refresh yields nothing", async () => {
    const repository = fakeRepository(row({ expiresAt: EXPIRING }));
    const refresh = vi.fn<Refresh>(async () => null);

    await expect(
      withInstagramAccessToken(WORKSPACE, async () => "ok", { repository, refresh, now: () => NOW }),
    ).rejects.toMatchObject({ code: "connection_expired" });
    expect(repository.markConnectionExpired).toHaveBeenCalledWith(CONNECTION);
  });

  it("buys one refresh and one retry on an unauthorized provider answer", async () => {
    const repository = fakeRepository(row());
    const refresh = vi.fn<Refresh>(async () => tokens());
    let calls = 0;

    const result = await withInstagramAccessToken(WORKSPACE, async (token) => {
      calls += 1;
      if (calls === 1) throw new InstagramGraphError("unauthorized", 190);
      return token;
    }, { repository, refresh, now: () => NOW });

    expect(result).toBe(NEW_ACCESS);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(repository.markConnectionExpired).not.toHaveBeenCalled();
  });

  it("expires the connection on a second unauthorized answer", async () => {
    const repository = fakeRepository(row());
    const refresh = vi.fn<Refresh>(async () => tokens());

    await expect(
      withInstagramAccessToken(WORKSPACE, async () => {
        throw new InstagramGraphError("unauthorized", 190);
      }, { repository, refresh, now: () => NOW }),
    ).rejects.toMatchObject({ code: "connection_expired" });
    expect(repository.markConnectionExpired).toHaveBeenCalledWith(CONNECTION);
  });

  it("does not refresh on a permission or rate-limit refusal", async () => {
    const repository = fakeRepository(row());
    const refresh = vi.fn<Refresh>();
    const error = new InstagramGraphError("forbidden", 10);

    await expect(
      withInstagramAccessToken(WORKSPACE, async () => { throw error; }, { repository, refresh, now: () => NOW }),
    ).rejects.toBe(error);
    expect(refresh).not.toHaveBeenCalled();
    expect(repository.markConnectionExpired).not.toHaveBeenCalled();
  });

  it("treats an unreadable stored token as a deployment fault, not a revoked connection", async () => {
    const repository = fakeRepository(row({ accessTokenEncrypted: "v1.not-a-real-ciphertext" }));
    const refresh = vi.fn<Refresh>();

    await expect(
      withInstagramAccessToken(WORKSPACE, async () => "ok", { repository, refresh, now: () => NOW }),
    ).rejects.toThrow("token_unreadable");
    expect(repository.markConnectionExpired).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
