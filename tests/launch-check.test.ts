import { describe, expect, it } from "vitest";
import { buildProbes, evaluate } from "../scripts/launch-check.mjs";

const origin = "https://example.test";

describe("launch-check probes", () => {
  it("lists one probe per registration and page, all read-only", () => {
    const probes = buildProbes(origin, { claimFlagOn: true });
    const names = probes.map((p) => p.name);
    expect(names).toEqual([
      "locale page zh-HK", "locale page en", "locale page zh-TW", "hreflang alternates",
      "robots.txt", "sitemap.xml", "magic-link route", "google claim start", "stripe webhook unsigned", "fixture guard",
    ]);
    for (const probe of probes) expect(["GET", "POST"]).toContain(probe.method);
  });

  it("evaluates each probe against a response", () => {
    const [zh, , , alternates, robots, sitemap, magic, claim, stripe, guard] = buildProbes(origin, { claimFlagOn: true });
    expect(evaluate(zh, { status: 200, headers: {}, body: '<html lang="zh-HK">' })).toEqual({ ok: true, detail: "200, lang zh-HK" });
    expect(evaluate(alternates, { status: 200, headers: {}, body: '<link rel="alternate" hrefLang="zh-TW" href="https://example.test/zh-TW/pricing"/>' }).ok).toBe(false);
    expect(evaluate(robots, { status: 200, headers: {}, body: "User-Agent: *\nDisallow: /*/owner/\nSitemap: https://example.test/sitemap.xml" }).ok).toBe(true);
    expect(evaluate(robots, { status: 200, headers: {}, body: "Sitemap: http://localhost:3000/sitemap.xml" }).ok).toBe(false);
    expect(evaluate(sitemap, { status: 200, headers: {}, body: "<loc>https://example.test/zh-HK</loc><loc>https://example.test/en</loc><loc>https://example.test/zh-TW</loc>" }).ok).toBe(true);
    expect(evaluate(magic, { status: 400, headers: {}, body: "{}" }).ok).toBe(true);
    expect(evaluate(claim, { status: 302, headers: { location: "https://accounts.google.com/o/oauth2/v2/auth?x=1" }, body: "" }).ok).toBe(true);
    expect(evaluate(claim, { status: 404, headers: {}, body: "" })).toEqual({ ok: false, detail: "404 — claim flag off or route missing (expected 302 to Google)" });
    expect(evaluate(stripe, { status: 400, headers: {}, body: "" }).ok).toBe(true);
    expect(evaluate(stripe, { status: 200, headers: {}, body: "" }).ok).toBe(false);
    expect(evaluate(guard, { status: 400, headers: {}, body: "{}" }).ok).toBe(true);
  });

  it("expects the claim route to answer 404 when the flag is off", () => {
    const claim = buildProbes(origin, { claimFlagOn: false }).find((p) => p.name === "google claim start")!;
    expect(evaluate(claim, { status: 404, headers: {}, body: "" }).ok).toBe(true);
    expect(evaluate(claim, { status: 302, headers: { location: "https://accounts.google.com/x" }, body: "" }).ok).toBe(false);
  });
});
