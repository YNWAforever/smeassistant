import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildInstagramConsentUrl,
  exchangeInstagramCode,
  INSTAGRAM_SCOPES,
  instagramOAuthConfigured,
  instagramOAuthEnabled,
  needsInstagramRefresh,
  refreshInstagramToken,
  signInstagramState,
  verifyInstagramState,
  type InstagramTransport,
} from "./instagram-connection";

const ENV_KEYS = [
  "INSTAGRAM_OAUTH_ENABLED",
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "INSTAGRAM_OAUTH_REDIRECT_URI",
  "INSTAGRAM_API_VERSION",
  "OAUTH_TOKEN_ENCRYPTION_KEY",
] as const;

const saved = new Map<string, string | undefined>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A transport whose answers are selected by the Graph endpoint being called. */
function transport(overrides: {
  short?: () => Promise<Response>;
  long?: () => Promise<Response>;
  permissions?: () => Promise<Response>;
  accounts?: () => Promise<Response>;
} = {}): InstagramTransport {
  const fake = async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/me/permissions")) {
      return overrides.permissions
        ? overrides.permissions()
        : json({ data: INSTAGRAM_SCOPES.map((permission) => ({ permission, status: "granted" })) });
    }
    if (url.pathname.endsWith("/me/accounts")) {
      return overrides.accounts
        ? overrides.accounts()
        : json({ data: [{ id: "page-1", instagram_business_account: { id: "17841400000000000", username: "eldage" } }] });
    }
    if (url.pathname.endsWith("/oauth/access_token")) {
      if (url.searchParams.get("grant_type") === "fb_exchange_token") {
        return overrides.long ? overrides.long() : json({ access_token: "long-lived", expires_in: 5_184_000 });
      }
      return overrides.short ? overrides.short() : json({ access_token: "short-lived", expires_in: 5_400 });
    }
    return json({ error: "unexpected" }, 500);
  };
  return { fetch: fake as unknown as typeof fetch };
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
  process.env.INSTAGRAM_OAUTH_ENABLED = "true";
  process.env.INSTAGRAM_APP_ID = "app-id";
  process.env.INSTAGRAM_APP_SECRET = "app-secret";
  process.env.INSTAGRAM_OAUTH_REDIRECT_URI = "https://scanner.test/api/oauth/instagram/callback";
  process.env.INSTAGRAM_API_VERSION = "v23.0";
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("instagramOAuthEnabled / instagramOAuthConfigured", () => {
  it("is off unless the flag is exactly true", () => {
    // Same contract as the repo's other flags: "1", "yes" and "TRUE" do not
    // open the flow. Surrounding whitespace is tolerated and trimmed.
    for (const value of ["1", "yes", "TRUE", ""]) {
      process.env.INSTAGRAM_OAUTH_ENABLED = value;
      expect(instagramOAuthEnabled()).toBe(false);
    }
    process.env.INSTAGRAM_OAUTH_ENABLED = "true";
    expect(instagramOAuthEnabled()).toBe(true);
  });

  it("is unconfigured until every value the consent redirect needs is present", () => {
    expect(instagramOAuthConfigured()).toBe(true);
    delete process.env.INSTAGRAM_APP_SECRET;
    expect(instagramOAuthConfigured()).toBe(false);
    process.env.INSTAGRAM_APP_SECRET = "app-secret";
    process.env.INSTAGRAM_OAUTH_ENABLED = "false";
    expect(instagramOAuthConfigured()).toBe(false);
  });
});

describe("state signing", () => {
  it("round-trips the workspace and locale", () => {
    const raw = signInstagramState("ws-1", "nonce-1", "zh-TW");
    expect(verifyInstagramState(raw)).toMatchObject({ workspaceId: "ws-1", nonce: "nonce-1", locale: "zh-TW" });
  });

  it("rejects a tampered payload, a tampered signature and extra dots", () => {
    const raw = signInstagramState("ws-1", "nonce-1");
    const [body, signature] = raw.split(".");
    const forged = `${Buffer.from(JSON.stringify({ workspaceId: "ws-2", nonce: "nonce-1", issuedAt: Date.now() }), "utf8").toString("base64url")}.${signature}`;
    expect(verifyInstagramState(forged)).toBeNull();
    expect(verifyInstagramState(`${body}.${signature.slice(0, -1)}`)).toBeNull();
    expect(verifyInstagramState(`${raw}.junk`)).toBeNull();
    expect(verifyInstagramState("")).toBeNull();
  });

  it("expires after ten minutes and refuses a state issued in the future", () => {
    const raw = signInstagramState("ws-1", "nonce-1");
    expect(verifyInstagramState(raw, Date.now() + 11 * 60 * 1000)).toBeNull();
    expect(verifyInstagramState(raw, Date.now() - 2 * 60 * 1000)).toBeNull();
  });
});

describe("buildInstagramConsentUrl", () => {
  it("carries the pinned version, client id, redirect, scopes and state", () => {
    const url = new URL(buildInstagramConsentUrl("signed-state"));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v23.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("app-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://scanner.test/api/oauth/instagram/callback");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("auth_type")).toBe("rerequest");
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...INSTAGRAM_SCOPES]);
    // Page permissions are required to enumerate the Facebook Page that owns
    // the professional account; without them the callback cannot resolve one.
    expect(url.searchParams.get("scope")).toContain("pages_show_list");
    expect(url.searchParams.get("scope")).toContain("pages_read_engagement");
  });
});

describe("exchangeInstagramCode", () => {
  it("returns the long-lived token and the resolved professional account", async () => {
    const result = await exchangeInstagramCode("code-1", { transport: transport() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens.accessToken).toBe("long-lived");
    expect(result.tokens.scopes).toEqual([...INSTAGRAM_SCOPES]);
    expect(result.tokens.expiresAt).not.toBeNull();
    expect(result.account).toEqual({ id: "17841400000000000", username: "eldage" });
  });

  it("refuses a partial grant instead of storing an unusable connection", async () => {
    const granted: Array<{ permission: string; status: string }> = INSTAGRAM_SCOPES
      .filter((scope) => scope !== "instagram_content_publish")
      .map((permission) => ({ permission, status: "granted" }));
    granted.push({ permission: "instagram_content_publish", status: "declined" });
    const result = await exchangeInstagramCode("code-1", {
      transport: transport({ permissions: async () => json({ data: granted }) }),
    });
    expect(result).toEqual({ ok: false, reason: "missing_permissions" });
  });

  it("distinguishes 'no linked Instagram account' from a transport failure", async () => {
    const noAccount = await exchangeInstagramCode("code-1", { transport: transport({ accounts: async () => json({ data: [{ id: "page-1", name: "A page" }] }) }) });
    expect(noAccount).toEqual({ ok: false, reason: "no_instagram_account" });

    const failed = await exchangeInstagramCode("code-1", { transport: transport({ short: async () => json({ error: "bad" }, 400) }) });
    expect(failed).toEqual({ ok: false, reason: "unavailable" });
  });

  it("does not call Meta at all when unconfigured", async () => {
    process.env.INSTAGRAM_OAUTH_REDIRECT_URI = "";
    let calls = 0;
    const result = await exchangeInstagramCode("code-1", { transport: { fetch: (async () => { calls += 1; return json({}); }) as unknown as typeof fetch } });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(calls).toBe(0);
  });
});

describe("refreshInstagramToken", () => {
  it("returns a new long-lived token", async () => {
    const tokens = await refreshInstagramToken("old-token", { transport: transport() });
    expect(tokens?.accessToken).toBe("long-lived");
    expect(tokens?.expiresAt).not.toBeNull();
  });

  it("returns null when Meta rejects the refresh", async () => {
    const tokens = await refreshInstagramToken("old-token", { transport: transport({ long: async () => json({ error: "invalid" }, 400) }) });
    expect(tokens).toBeNull();
  });
});

describe("needsInstagramRefresh", () => {
  it("treats a missing or invalid expiry as due", () => {
    expect(needsInstagramRefresh(null)).toBe(true);
    expect(needsInstagramRefresh("not-a-date")).toBe(true);
  });

  it("is due inside the seven-day window and not before", () => {
    const now = Date.parse("2026-11-18T00:00:00Z");
    expect(needsInstagramRefresh("2026-11-24T00:00:00Z", undefined, now)).toBe(true);
    expect(needsInstagramRefresh("2026-12-01T00:00:00Z", undefined, now)).toBe(false);
  });
});
