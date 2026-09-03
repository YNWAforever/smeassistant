import { describe, expect, it } from "vitest";

import { localeFromPathname, resolveHtmlLang, resolveLocaleRedirect } from "@/lib/funnel/locale-redirect";

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
