import { describe, expect, it, vi } from "vitest";
import { buildProbes, evaluate, evaluateAuthenticatedClaimRedirect, main, parseArgs, runProbe } from "../scripts/launch-check.mjs";

const origin = "https://example.test";
const finalOrigin = "https://merchant.test";
const reply = (status: number, body = "", headers: Record<string, string> = {}) => ({ status, body, headers });
const json = (status: number, error: string) => reply(status, JSON.stringify({ error }));
const probe = (name: string, canonicalOrigin = origin, claimFlagOn = true) => buildProbes(origin, { canonicalOrigin, claimFlagOn }).find((p) => p.name === name)!;
const metadata = (host = origin) => `<LINK HREF='${host}/zh-HK/pricing' REL='canonical'>` +
  ["zh-HK", "en", "zh-TW", "x-default"].map((locale) => `<link href='${host}/${locale === "x-default" ? "zh-HK" : locale}/pricing' HREFLANG='${locale}' rel='alternate'>`).join("");

function fixtureFetch(canonicalOrigin = origin) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const bodies: Record<string, { status: number; body: string }> = {
      "/zh-HK/pricing": reply(200, metadata(canonicalOrigin)),
      "/robots.txt": reply(200, `Disallow: /*/owner/\nSitemap: ${canonicalOrigin}/sitemap.xml`),
      "/sitemap.xml": reply(200, `<urlset>${["zh-HK", "en", "zh-TW"].map((locale) => `<url><loc>${canonicalOrigin}/${locale}</loc></url>`).join("")}</urlset>`),
      "/api/owner/magic-link": json(400, "invalid_email"),
      "/api/oauth/google/claim/start": json(401, "unauthenticated"),
      "/api/webhooks/stripe": json(400, "Missing stripe-signature header"),
      "/api/scan/start": json(400, "market must be HK or TW"),
    };
    const r = bodies[url.pathname] ?? reply(200, `<HTML data-theme='light' LANG='${url.pathname.slice(1)}'>`);
    return new Response(r.body, { status: r.status });
  });
}

describe("public launch checks", () => {
  it("lists bounded public probes without registration or fixture-mode claims", () => {
    const probes = buildProbes(origin, { claimFlagOn: true });
    expect(probes).toHaveLength(11);
    expect(probes.every((p) => p.category)).toBe(true);
    expect(probes.map((p) => p.name).join(" ")).not.toMatch(/registered|fixture guard/);
    expect(probes.filter((p) => p.method === "POST").map((p) => p.body)).toEqual([{}, {}, { business_name: "launch-check", market: "XX", manual_entry: true }]);
  });

  it("recognizes the anonymous authentication boundary with claim enabled", () => {
    expect(evaluate(probe("google claim start"), json(401, "unauthenticated")).ok).toBe(true);
  });

  it.each([302, 307])("rejects constructed %s redirects in an anonymous public check", (status) => {
    const result = evaluate(probe("google claim start"), reply(status, "", { location: "https://accounts.google.com/o/oauth2/v2/auth" }));
    expect(result.ok).toBe(false);
    expect(result.detail).not.toContain("redirect URI registered");
  });

  it("matches the flag-off route contract and rejects unavailable or misleading responses", () => {
    expect(evaluate(probe("google claim start", origin, false), json(404, "not_found")).ok).toBe(true);
    for (const r of [json(404, "not_found"), json(401, "different_error"), reply(401, "<html>Sign in</html>"), json(503, "unavailable"), reply(200)]) {
      expect(evaluate(probe("google claim start"), r).ok).toBe(false);
    }
    expect(evaluate(probe("google claim start"), json(503, "unavailable")).detail).toContain("configuration unavailable");
    expect(evaluate(probe("google claim start", origin, false), json(401, "unauthenticated")).ok).toBe(false);
    expect(evaluate(probe("google claim start", origin, false), reply(404, "generic proxy page")).ok).toBe(false);
  });

  it.each([302, 307])("separate authenticated evaluator accepts framework redirect %s without proving registration", (status) => {
    const result = evaluateAuthenticatedClaimRedirect(reply(status, "", { location: "https://accounts.google.com/o/oauth2/v2/auth?state=fixture" }));
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("registration, consent and ownership not verified");
  });

  it.each(["https://accounts.google.com.attacker.test/o/oauth2/v2/auth", "http://accounts.google.com/o/oauth2/v2/auth", "https://accounts.google.com@attacker.test/o/oauth2/v2/auth", "https://accounts.google.com/wrong", "not-a-url"])("rejects an invalid consent target %s", (location) => {
    expect(evaluateAuthenticatedClaimRedirect(reply(307, "", { location })).ok).toBe(false);
  });

  it("does not accept a missing authenticated session as redirect evidence", () => {
    expect(evaluateAuthenticatedClaimRedirect(json(401, "unauthenticated")).ok).toBe(false);
  });

  it.each(["scan invalid-market rejection", "stripe unsigned signature rejection", "magic-link input rejection", "google claim start"])("records rate limiting as blocked for %s", (name) => {
    expect(evaluate(probe(name), reply(429))).toMatchObject({ ok: false, status: "blocked" });
  });

  it("requires the exact negative boundary response, not just a generic 400", () => {
    const cases = [
      ["scan invalid-market rejection", "market must be HK or TW"],
      ["stripe unsigned signature rejection", "Missing stripe-signature header"],
      ["magic-link input rejection", "invalid_email"],
    ];
    for (const [name, error] of cases) {
      expect(evaluate(probe(name), json(400, error)).ok).toBe(true);
      for (const r of [reply(400), json(400, "unrelated"), reply(500), reply(503), reply(200)]) expect(evaluate(probe(name), r).ok).toBe(false);
    }
  });

  it("accepts reordered and case-varied HTML attributes", () => {
    expect(evaluate(probe("locale page zh-HK"), reply(200, "<HTML data-theme='light' LANG='zh-hk'>")).ok).toBe(true);
    expect(evaluate(probe("canonical URL"), reply(200, metadata())).ok).toBe(true);
    expect(evaluate(probe("hreflang alternates"), reply(200, metadata())).ok).toBe(true);
  });

  it.each(["<html lang='zh-HK'", "<html lang='zh-HK>", "<!-- <html lang='zh-HK'> -->", "<script>const s = `<html lang='zh-HK'>`;</script>", "<html lang='en' lang='zh-HK'>"])("rejects malformed or non-markup language evidence %s", (body) => {
    expect(evaluate(probe("locale page zh-HK"), reply(200, body)).ok).toBe(false);
  });

  it("rejects wrong canonical origins and paths unless the alternate origin is explicit", () => {
    for (const name of ["canonical URL", "hreflang alternates"]) {
      expect(evaluate(probe(name), reply(200, metadata(finalOrigin))).ok).toBe(false);
      expect(evaluate(probe(name, finalOrigin), reply(200, metadata(finalOrigin))).ok).toBe(true);
      expect(evaluate(probe(name, finalOrigin), reply(200, metadata(finalOrigin).replaceAll("/pricing", "/wrong"))).ok).toBe(false);
      expect(evaluate(probe(name, finalOrigin), reply(503, metadata(finalOrigin))).ok).toBe(false);
      expect(evaluate(probe(name), reply(200, `<!-- ${metadata()} -->`)).ok).toBe(false);
    }
  });

  it("checks robots and sitemap against the explicit canonical origin", () => {
    const robots = reply(200, `Disallow: /*/owner/\nSitemap: ${finalOrigin}/sitemap.xml`);
    const sitemap = reply(200, `<urlset>${["zh-HK", "en", "zh-TW"].map((l) => `<url><loc>${finalOrigin}/${l}</loc></url>`).join("")}</urlset>`);
    for (const [name, response] of [["robots.txt", robots], ["sitemap.xml", sitemap]] as const) {
      expect(evaluate(probe(name), response).ok).toBe(false);
      expect(evaluate(probe(name, finalOrigin), response).ok).toBe(true);
    }
  });
});

describe("launch-check command", () => {
  it("defaults canonical origin and keeps the existing command syntax", () => {
    expect(parseArgs(["--origin", `${origin}/`, "--claim-flag", "on"])).toEqual({ origin, canonicalOrigin: origin, claimFlagOn: true });
  });

  it.each([[], ["--origin", "https://user:pass@example.test"], ["--origin", `${origin}/path`], ["--origin", `${origin}?token=x`], ["--origin", "file:///tmp"], ["--origin", origin, "--canonical-origin", "bad"], ["--origin", origin, "--claim-flag", "typo"]].map((argv) => ({ argv })))("rejects invalid arguments $argv", ({ argv }) => {
    expect(() => parseArgs(argv)).toThrow();
  });

  it("passes public fixtures while explicitly leaving provider acceptance not run", async () => {
    const fetchImpl = fixtureFetch(finalOrigin);
    const log = vi.fn();
    const exit = await main(["--origin", origin, "--canonical-origin", finalOrigin, "--claim-flag", "on"], { fetchImpl, log });
    expect(exit).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("Authenticated/provider acceptance: not run");
    expect(log.mock.calls.flat().join("\n")).not.toContain("redirect URI registered");
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(new URL(String(url)).origin).toBe(origin);
      expect(init).toMatchObject({ redirect: "manual", credentials: "omit" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers ?? {}).not.toHaveProperty("authorization");
      expect(init?.headers ?? {}).not.toHaveProperty("cookie");
    }
  });

  it.each([429, 503, 307])("returns nonzero for unexpected or blocked status %s", async (status) => {
    const log = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status }));
    expect(await main(["--origin", origin], { fetchImpl, log })).toBe(1);
    expect(log.mock.calls.flat().join("\n")).toContain(status === 429 ? "BLOCKED" : "FAILED");
  });

  it("aborts a stalled request and returns nonzero while continuing other probes", async () => {
    const stalled = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
    }));
    await expect(runProbe(probe("google claim start"), origin, { fetchImpl: stalled, timeoutMs: 5 })).rejects.toMatchObject({ name: "TimeoutError" });
    const fetchImpl = fixtureFetch();
    fetchImpl.mockImplementationOnce(stalled);
    const log = vi.fn();
    expect(await main(["--origin", origin, "--claim-flag", "on"], { fetchImpl, log, timeoutMs: 5 })).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(11);
    expect(log.mock.calls.flat().join("\n")).toContain("request failed:");
  });
});

it("does not read language or canonical metadata from inert elements", () => {
  expect(evaluate(probe("locale page zh-HK"), reply(200, '<html lang="en"><body><textarea><html lang="zh-HK"></textarea></body></html>')).ok).toBe(false);
  for (const wrapper of ["template", "script", "textarea"]) {
    expect(evaluate(probe("canonical URL"), reply(200, `<html><head><${wrapper}>${metadata()}</${wrapper}></head></html>`)).ok).toBe(false);
    expect(evaluate(probe("hreflang alternates"), reply(200, `<html><head><${wrapper}>${metadata()}</${wrapper}></head></html>`)).ok).toBe(false);
  }
});

it("rejects commented-out and malformed sitemap XML", () => {
  const urls = ["zh-HK", "en", "zh-TW"].map((locale) => `<url><loc>${origin}/${locale}</loc></url>`).join("");
  for (const body of [`<urlset><!-- ${urls} --></urlset>`, `<urlset>${urls}`, `<root>${urls}</root>`]) {
    expect(evaluate(probe("sitemap.xml"), reply(200, body)).ok).toBe(false);
  }
});
