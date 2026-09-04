import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  isOwnerGatedPath,
  isOwnerPath,
  localeFromPathname,
  resolveHtmlLang,
  resolveLocaleRedirect,
  safeReturnTo,
  signInRedirectFor,
} from "@/lib/funnel/locale-redirect";

const supabase = vi.hoisted(() => ({
  user: null as null | { id: string },
  error: null as null | { message: string },
  createServerClient: vi.fn(),
  setAll: null as null | ((cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (url: string, key: string, opts: { cookies: { setAll: typeof supabase.setAll } }) => {
    supabase.createServerClient(url, key);
    supabase.setAll = opts.cookies.setAll;
    return {
      auth: {
        getUser: async () => {
          // Simulate a refresh rotating the auth cookie before answering.
          supabase.setAll?.([{ name: "sb-test-auth-token", value: "rotated", options: { path: "/" } }]);
          return { data: { user: supabase.user }, error: supabase.error };
        },
      },
    };
  },
}));

import { proxy, resetProxyWarnings } from "@/proxy";

describe("resolveLocaleRedirect", () => {
  it("prefixes unlocalised page paths with the default locale", () => {
    expect(resolveLocaleRedirect("/")).toBe("/zh-HK");
    expect(resolveLocaleRedirect("/scan")).toBe("/zh-HK/scan");
    expect(resolveLocaleRedirect("/r/abc123")).toBe("/zh-HK/r/abc123");
    expect(resolveLocaleRedirect("/owner/sign-in")).toBe("/zh-HK/owner/sign-in");
    expect(resolveLocaleRedirect("scan")).toBe("/zh-HK/scan");
  });

  it("leaves localised paths alone for every supported locale", () => {
    expect(resolveLocaleRedirect("/zh-HK")).toBeNull();
    expect(resolveLocaleRedirect("/zh-HK/scan")).toBeNull();
    expect(resolveLocaleRedirect("/en")).toBeNull();
    expect(resolveLocaleRedirect("/en/pricing")).toBeNull();
    expect(resolveLocaleRedirect("/zh-TW/r/slug")).toBeNull();
  });

  it("passes route handlers, Next internals and files through", () => {
    expect(resolveLocaleRedirect("/api/scan/start")).toBeNull();
    expect(resolveLocaleRedirect("/api")).toBeNull();
    expect(resolveLocaleRedirect("/auth/callback")).toBeNull();
    expect(resolveLocaleRedirect("/_next/static/chunk.js")).toBeNull();
    expect(resolveLocaleRedirect("/_vercel/insights/script.js")).toBeNull();
    expect(resolveLocaleRedirect("/favicon.svg")).toBeNull();
    expect(resolveLocaleRedirect("/brand/logo.png")).toBeNull();
  });

  it("does not treat look-alike segments as passthrough", () => {
    expect(resolveLocaleRedirect("/apix")).toBe("/zh-HK/apix");
    expect(resolveLocaleRedirect("/authors")).toBe("/zh-HK/authors");
    expect(resolveLocaleRedirect("/en-US/scan")).toBe("/zh-HK/en-US/scan");
  });
});

describe("locale helpers", () => {
  it("reads the locale from the first segment", () => {
    expect(localeFromPathname("/en/scan")).toBe("en");
    expect(localeFromPathname("/zh-TW")).toBe("zh-TW");
    expect(localeFromPathname("/scan")).toBeNull();
    expect(localeFromPathname("/")).toBeNull();
  });

  it("resolves <html lang> from the proxy header with a safe default", () => {
    expect(resolveHtmlLang("en")).toBe("en");
    expect(resolveHtmlLang("zh-TW")).toBe("zh-TW");
    expect(resolveHtmlLang(null)).toBe("zh-HK");
    expect(resolveHtmlLang("fr")).toBe("zh-HK");
  });
});

describe("owner gate decisions", () => {
  it("recognises owner paths in every locale", () => {
    expect(isOwnerPath("/zh-HK/owner")).toBe(true);
    expect(isOwnerPath("/en/owner/sign-in")).toBe(true);
    expect(isOwnerPath("/zh-TW/owner/kam-man-house/actions")).toBe(true);
    expect(isOwnerPath("/en/ownership")).toBe(false);
    expect(isOwnerPath("/owner/sign-in")).toBe(false);
    expect(isOwnerPath("/en/scan")).toBe(false);
  });

  it("gates everything under owner except sign-in", () => {
    expect(isOwnerGatedPath("/en/owner")).toBe(true);
    expect(isOwnerGatedPath("/en/owner/select-workspace")).toBe(true);
    expect(isOwnerGatedPath("/en/owner/onboarding")).toBe(true);
    expect(isOwnerGatedPath("/zh-HK/owner/kam-man-house/settings/team")).toBe(true);
    expect(isOwnerGatedPath("/en/owner/sign-in")).toBe(false);
    expect(isOwnerGatedPath("/en/owner/sign-in/")).toBe(false);
    expect(isOwnerGatedPath("/en/owner/sign-in/sent")).toBe(false);
    expect(isOwnerGatedPath("/en/owner/sign-inx")).toBe(true);
    expect(isOwnerGatedPath("/en/scan")).toBe(false);
  });

  it("builds the sign-in redirect with path and search as returnTo", () => {
    expect(signInRedirectFor("en", "/en/owner/kam-man-house", "?tab=actions")).toBe(
      "/en/owner/sign-in?returnTo=%2Fen%2Fowner%2Fkam-man-house%3Ftab%3Dactions",
    );
    expect(signInRedirectFor("zh-HK", "/zh-HK/owner/select-workspace", "")).toBe(
      "/zh-HK/owner/sign-in?returnTo=%2Fzh-HK%2Fowner%2Fselect-workspace",
    );
  });

  it("accepts only same-origin absolute paths as returnTo", () => {
    expect(safeReturnTo("/en/owner/x?y=1")).toBe("/en/owner/x?y=1");
    expect(safeReturnTo("//evil.example")).toBeNull();
    expect(safeReturnTo("/\\evil.example")).toBeNull();
    expect(safeReturnTo("https://evil.example/")).toBeNull();
    expect(safeReturnTo("owner")).toBeNull();
    expect(safeReturnTo("")).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(`/${"a".repeat(3000)}`)).toBeNull();
  });
});

describe("proxy()", () => {
  const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };

  function req(path: string, cookies: Record<string, string> = {}) {
    const headers = new Headers();
    const cookie = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    if (cookie) headers.set("cookie", cookie);
    return new NextRequest(`https://app.test${path}`, { headers });
  }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    supabase.user = null;
    supabase.error = null;
    supabase.createServerClient.mockClear();
    resetProxyWarnings();
  });

  afterEach(() => {
    if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    if (env.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.key;
  });

  it("still redirects unlocalised paths and stamps the locale header", async () => {
    const redirected = await proxy(req("/scan?market=tw"));
    expect(redirected.status).toBe(307);
    expect(redirected.headers.get("location")).toBe("https://app.test/zh-HK/scan?market=tw");

    const passed = await proxy(req("/en/scan"));
    expect(passed.status).toBe(200);
    expect(passed.headers.get("x-middleware-request-x-sme-locale")).toBe("en");
    // Public pages never touch Supabase.
    expect(supabase.createServerClient).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor on an owner page to sign-in with returnTo", async () => {
    const response = await proxy(req("/en/owner/kam-man-house/actions?state=open"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/owner/sign-in?returnTo=%2Fen%2Fowner%2Fkam-man-house%2Factions%3Fstate%3Dopen",
    );
    expect(supabase.createServerClient).toHaveBeenCalledWith("https://project.supabase.test", "anon-key");
  });

  it("lets a signed-in user through and forwards refreshed auth cookies", async () => {
    supabase.user = { id: "user-1" };
    const response = await proxy(req("/zh-HK/owner/select-workspace", { "sb-test-auth-token": "old" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-x-sme-locale")).toBe("zh-HK");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("rotated");
  });

  it("never gates the sign-in page but still refreshes the session there", async () => {
    const response = await proxy(req("/zh-TW/owner/sign-in?claim=abcdef"));
    expect(response.status).toBe(200);
    expect(supabase.createServerClient).toHaveBeenCalledTimes(1);
  });

  it("treats an auth error as signed out", async () => {
    supabase.error = { message: "jwt expired" };
    const response = await proxy(req("/en/owner/onboarding"));
    expect(response.status).toBe(307);
  });

  it("skips the gate, warning once, when Supabase env is absent", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const first = await proxy(req("/en/owner/select-workspace"));
    const second = await proxy(req("/en/owner/kam-man-house"));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(supabase.createServerClient).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("metadata file routes", () => {
  it("never locale-redirects the root Open Graph image or icon routes", async () => {
    const { resolveLocaleRedirect } = await import("@/lib/funnel/locale-redirect");
    expect(resolveLocaleRedirect("/opengraph-image")).toBeNull();
    expect(resolveLocaleRedirect("/icon")).toBeNull();
    expect(resolveLocaleRedirect("/apple-icon")).toBeNull();
  });
});
