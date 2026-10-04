import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real repository is never reached: every test injects a fake.
vi.mock("@/lib/db/client", () => ({
  getPool: () => {
    throw new Error("default_database_forbidden");
  },
}));

import { GBP_SCOPE_REQUIRED, type GoogleTokenSet } from "@/lib/oauth/google-connection";
import { GbpError } from "@/lib/oauth/google-reviews";
import { decryptToken, encryptToken } from "@/lib/security/token-crypto";
import { GbpConnectionError, withGbpAccessToken } from "./connection";

const KEY = Buffer.alloc(32, 7).toString("base64");
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONNECTION = "22222222-2222-4222-8222-222222222222";

const OLD_ACCESS = "ya29.old-access-token-PLAINTEXT";
const REFRESH = "1//refresh-token-PLAINTEXT";
const NEW_ACCESS = "ya29.new-access-token-PLAINTEXT";
const SECRETS = [OLD_ACCESS, REFRESH, NEW_ACCESS];

const NOW = Date.parse("2026-10-04T12:00:00Z");
const FRESH = new Date(NOW + 60 * 60 * 1000).toISOString();
const EXPIRING = new Date(NOW + 60 * 1000).toISOString();
const NEW_EXPIRY = new Date(NOW + 3600 * 1000).toISOString();

type Refresh = (refreshToken: string) => Promise<GoogleTokenSet | null>;
type Fn = (accessToken: string) => Promise<string>;

type Row = {
  id: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  scopes: string[];
  expiresAt: string | null;
};

function fakeRepository(row: Row | null) {
  return {
    activeGbpConnection: vi.fn<(workspaceId: string) => Promise<Row | null>>(async () => row),
    storeRefreshedToken: vi.fn<
      (input: { connectionId: string; workspaceId: string; accessTokenEncrypted: string; expiresAt: string | null }) => Promise<void>
    >(async () => {}),
    markConnectionExpired: vi.fn<(connectionId: string) => Promise<void>>(async () => {}),
  };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: CONNECTION,
    accessTokenEncrypted: encryptToken(OLD_ACCESS),
    refreshTokenEncrypted: encryptToken(REFRESH),
    scopes: [GBP_SCOPE_REQUIRED],
    expiresAt: FRESH,
    ...overrides,
  };
}

const tokenSet = (accessToken = NEW_ACCESS): GoogleTokenSet => ({
  accessToken,
  refreshToken: null,
  expiresAt: NEW_EXPIRY,
  scopes: [GBP_SCOPE_REQUIRED],
});

function deps(repository: ReturnType<typeof fakeRepository>, refresh = vi.fn<Refresh>(async () => tokenSet())) {
  return { deps: { repository, refresh, now: () => NOW }, refresh };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  vi.stubEnv("OAUTH_TOKEN_ENCRYPTION_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("withGbpAccessToken", () => {
  it("no active row gives connection_missing; a row without business.manage gives connection_missing", async () => {
    const none = fakeRepository(null);
    const fn = vi.fn(async () => "never");
    const missing = await failure(withGbpAccessToken(WORKSPACE, fn, deps(none).deps));
    expect(missing).toBeInstanceOf(GbpConnectionError);
    expect((missing as GbpConnectionError).code).toBe("connection_missing");
    expect(none.activeGbpConnection).toHaveBeenCalledWith(WORKSPACE);

    const narrow = fakeRepository(row({ scopes: ["openid", "email"] }));
    const { deps: narrowDeps, refresh } = deps(narrow);
    const scopeless = await failure(withGbpAccessToken(WORKSPACE, fn, narrowDeps));
    expect(scopeless).toBeInstanceOf(GbpConnectionError);
    expect((scopeless as GbpConnectionError).code).toBe("connection_missing");

    expect(fn).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(narrow.markConnectionExpired).not.toHaveBeenCalled();
    expect(narrow.storeRefreshedToken).not.toHaveBeenCalled();
  });

  it("a fresh token is passed to fn without refreshing", async () => {
    const repository = fakeRepository(row());
    const { deps: d, refresh } = deps(repository);
    const fn = vi.fn<Fn>(async (token) => `used:${token.length}`);

    await expect(withGbpAccessToken(WORKSPACE, fn, d)).resolves.toBe(`used:${OLD_ACCESS.length}`);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(OLD_ACCESS);
    expect(refresh).not.toHaveBeenCalled();
    expect(repository.storeRefreshedToken).not.toHaveBeenCalled();
    expect(repository.markConnectionExpired).not.toHaveBeenCalled();
  });

  it("an expiring token is refreshed, the re-sealed token stored, and fn gets the new token", async () => {
    for (const expiresAt of [EXPIRING, null]) {
      const repository = fakeRepository(row({ expiresAt }));
      const { deps: d, refresh } = deps(repository);
      const fn = vi.fn<Fn>(async () => "ok");

      await expect(withGbpAccessToken(WORKSPACE, fn, d)).resolves.toBe("ok");
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledWith(REFRESH);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(NEW_ACCESS);

      expect(repository.storeRefreshedToken).toHaveBeenCalledTimes(1);
      const stored = repository.storeRefreshedToken.mock.calls[0][0];
      expect(stored.connectionId).toBe(CONNECTION);
      expect(stored.workspaceId).toBe(WORKSPACE);
      expect(stored.expiresAt).toBe(NEW_EXPIRY);
      // Sealed at rest, and it opens to the new token.
      expect(stored.accessTokenEncrypted).not.toContain(NEW_ACCESS);
      expect(decryptToken(stored.accessTokenEncrypted)).toBe(NEW_ACCESS);
      expect(repository.markConnectionExpired).not.toHaveBeenCalled();
    }
  });

  it("refresh returning null marks the row expired and throws connection_expired", async () => {
    const repository = fakeRepository(row({ expiresAt: EXPIRING }));
    const refresh = vi.fn<Refresh>(async () => null);
    const fn = vi.fn(async () => "never");

    const error = await failure(withGbpAccessToken(WORKSPACE, fn, { repository, refresh, now: () => NOW }));
    expect(error).toBeInstanceOf(GbpConnectionError);
    expect((error as GbpConnectionError).code).toBe("connection_expired");
    expect(repository.markConnectionExpired).toHaveBeenCalledTimes(1);
    expect(repository.markConnectionExpired).toHaveBeenCalledWith(CONNECTION);
    expect(repository.storeRefreshedToken).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
  });

  it("an expiring token with no stored refresh token marks the row expired and throws connection_expired", async () => {
    const repository = fakeRepository(row({ expiresAt: EXPIRING, refreshTokenEncrypted: null }));
    const { deps: d, refresh } = deps(repository);
    const fn = vi.fn(async () => "never");

    const error = await failure(withGbpAccessToken(WORKSPACE, fn, d));
    expect((error as GbpConnectionError).code).toBe("connection_expired");
    expect(refresh).not.toHaveBeenCalled();
    expect(repository.markConnectionExpired).toHaveBeenCalledWith(CONNECTION);
    expect(fn).not.toHaveBeenCalled();
  });

  it("fn throwing unauthorized once triggers one refresh and one retry; a second unauthorized marks expired and throws connection_expired", async () => {
    // Once: refresh, retry with the new token, succeed.
    const once = fakeRepository(row());
    const { deps: onceDeps, refresh: onceRefresh } = deps(once);
    const recovering = vi
      .fn<Fn>()
      .mockRejectedValueOnce(new GbpError("unauthorized"))
      .mockResolvedValueOnce("second try");
    await expect(withGbpAccessToken(WORKSPACE, recovering, onceDeps)).resolves.toBe("second try");
    expect(recovering.mock.calls.map(([token]) => token)).toEqual([OLD_ACCESS, NEW_ACCESS]);
    expect(onceRefresh).toHaveBeenCalledTimes(1);
    expect(once.storeRefreshedToken).toHaveBeenCalledTimes(1);
    expect(once.markConnectionExpired).not.toHaveBeenCalled();

    // Twice: one refresh, one retry, then expired.
    const twice = fakeRepository(row());
    const { deps: twiceDeps, refresh: twiceRefresh } = deps(twice);
    const rejecting = vi.fn<Fn>(async () => {
      throw new GbpError("unauthorized");
    });
    const error = await failure(withGbpAccessToken(WORKSPACE, rejecting, twiceDeps));
    expect(error).toBeInstanceOf(GbpConnectionError);
    expect((error as GbpConnectionError).code).toBe("connection_expired");
    expect(rejecting).toHaveBeenCalledTimes(2);
    expect(twiceRefresh).toHaveBeenCalledTimes(1);
    expect(twice.markConnectionExpired).toHaveBeenCalledTimes(1);
    expect(twice.markConnectionExpired).toHaveBeenCalledWith(CONNECTION);
  });

  it("an unauthorized whose refresh returns null marks the row expired and throws connection_expired", async () => {
    const repository = fakeRepository(row());
    const refresh = vi.fn<Refresh>(async () => null);
    const fn = vi.fn<Fn>(async () => {
      throw new GbpError("unauthorized");
    });

    const error = await failure(withGbpAccessToken(WORKSPACE, fn, { repository, refresh, now: () => NOW }));
    expect((error as GbpConnectionError).code).toBe("connection_expired");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(repository.markConnectionExpired).toHaveBeenCalledTimes(1);
  });

  it("a just-refreshed token that gets unauthorized is not refreshed again", async () => {
    const repository = fakeRepository(row({ expiresAt: EXPIRING }));
    const { deps: d, refresh } = deps(repository);
    const fn = vi.fn<Fn>(async () => {
      throw new GbpError("unauthorized");
    });

    const error = await failure(withGbpAccessToken(WORKSPACE, fn, d));
    expect((error as GbpConnectionError).code).toBe("connection_expired");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(NEW_ACCESS);
    expect(repository.markConnectionExpired).toHaveBeenCalledTimes(1);
  });

  it("forbidden is rethrown and the row is never marked", async () => {
    for (const expiresAt of [FRESH, EXPIRING]) {
      const repository = fakeRepository(row({ expiresAt }));
      const { deps: d, refresh } = deps(repository);
      const forbidden = new GbpError("forbidden");
      const fn = vi.fn<Fn>(async () => {
        throw forbidden;
      });

      await expect(withGbpAccessToken(WORKSPACE, fn, d)).rejects.toBe(forbidden);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(repository.markConnectionExpired).not.toHaveBeenCalled();
      // A pre-call refresh may store a new token; the 403 itself never refreshes.
      expect(refresh).toHaveBeenCalledTimes(expiresAt === FRESH ? 0 : 1);
      expect(repository.storeRefreshedToken).toHaveBeenCalledTimes(expiresAt === FRESH ? 0 : 1);
    }
  });

  it("every other GbpError and any non-Gbp error from fn is rethrown unchanged without touching the row", async () => {
    const errors = [
      new GbpError("not_found"),
      new GbpError("rate_limited"),
      new GbpError("provider_error"),
      new GbpError("timeout"),
      new GbpError("network"),
      new Error("something else"),
    ];
    for (const thrown of errors) {
      const repository = fakeRepository(row());
      const { deps: d, refresh } = deps(repository);
      const fn = vi.fn<Fn>(async () => {
        throw thrown;
      });
      await expect(withGbpAccessToken(WORKSPACE, fn, d)).rejects.toBe(thrown);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(refresh).not.toHaveBeenCalled();
      expect(repository.markConnectionExpired).not.toHaveBeenCalled();
      expect(repository.storeRefreshedToken).not.toHaveBeenCalled();
    }
  });

  it("an unreadable stored token throws token_unreadable without touching the row", async () => {
    const repository = fakeRepository(row({ accessTokenEncrypted: "v1.not.a-real.payload" }));
    const { deps: d, refresh } = deps(repository);
    const fn = vi.fn(async () => "never");

    const error = await failure(withGbpAccessToken(WORKSPACE, fn, d));
    expect(error).not.toBeInstanceOf(GbpConnectionError);
    expect((error as Error).message).toBe("token_unreadable");
    expect(fn).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(repository.markConnectionExpired).not.toHaveBeenCalled();
    expect(repository.storeRefreshedToken).not.toHaveBeenCalled();
  });

  it("no thrown error message or logged argument contains the plaintext access or refresh token", async () => {
    const logged: unknown[][] = [];
    for (const method of ["error", "warn", "log", "info", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }

    const thrown: unknown[] = [];
    const scenarios: Array<() => Promise<unknown>> = [
      // refresh null before the call
      () =>
        withGbpAccessToken(WORKSPACE, async () => "x", {
          repository: fakeRepository(row({ expiresAt: EXPIRING })),
          refresh: async () => null,
          now: () => NOW,
        }),
      // two unauthorized
      () =>
        withGbpAccessToken(
          WORKSPACE,
          async () => {
            throw new GbpError("unauthorized");
          },
          deps(fakeRepository(row())).deps,
        ),
      // forbidden
      () =>
        withGbpAccessToken(
          WORKSPACE,
          async () => {
            throw new GbpError("forbidden");
          },
          deps(fakeRepository(row({ expiresAt: EXPIRING }))).deps,
        ),
      // missing scope
      () => withGbpAccessToken(WORKSPACE, async () => "x", deps(fakeRepository(row({ scopes: [] }))).deps),
      // unreadable refresh token
      () =>
        withGbpAccessToken(WORKSPACE, async () => "x", deps(fakeRepository(row({ expiresAt: EXPIRING, refreshTokenEncrypted: "garbage" }))).deps),
      // the store fails
      () => {
        const repository = fakeRepository(row({ expiresAt: EXPIRING }));
        repository.storeRefreshedToken.mockRejectedValueOnce(new Error("db down"));
        return withGbpAccessToken(WORKSPACE, async () => "x", deps(repository).deps);
      },
    ];
    for (const run of scenarios) thrown.push(await failure(run()));

    expect(thrown).toHaveLength(scenarios.length);
    for (const error of thrown) {
      const text = [
        String(error),
        error instanceof Error ? error.message : "",
        error instanceof Error ? String(error.stack) : "",
        JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
        error instanceof Error && error.cause !== undefined ? String(error.cause) : "",
      ].join("\n");
      for (const secret of SECRETS) expect(text).not.toContain(secret);
    }
    const logText = logged.map((args) => args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : JSON.stringify(arg))).join(" ")).join("\n");
    for (const secret of SECRETS) expect(logText).not.toContain(secret);
  });
});

describe("GbpConnectionError", () => {
  it("carries only a code", () => {
    const error = new GbpConnectionError("connection_expired");
    expect(error.code).toBe("connection_expired");
    expect(error.message).toBe("connection_expired");
    expect(error).toBeInstanceOf(Error);
  });
});
