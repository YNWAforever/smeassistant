// Read-only launch readiness probes (docs/superpowers/specs/2026-09-04-launch-readiness-design.md).
// Usage: node scripts/launch-check.mjs --origin https://host [--claim-flag on|off]
// Every probe is safe to run against production: nothing is created, no secret is sent.
import { pathToFileURL } from "node:url";

const LOCALES = ["zh-HK", "en", "zh-TW"];

/** @returns {Array<{name:string, method:"GET"|"POST", path:string, body?:object, check:(r:{status:number,headers:Record<string,string>,body:string}, origin:string)=>{ok:boolean, detail:string}}>} */
export function buildProbes(origin, { claimFlagOn }) {
  const langCheck = (locale) => (r) => {
    const ok = r.status === 200 && r.body.includes(`<html lang="${locale}"`);
    return { ok, detail: ok ? `200, lang ${locale}` : `${r.status}${r.status === 200 ? ", lang attribute missing" : ""}` };
  };
  return [
    ...LOCALES.map((locale) => ({ name: `locale page ${locale}`, method: "GET", path: `/${locale}`, check: langCheck(locale) })),
    {
      name: "hreflang alternates", method: "GET", path: "/zh-HK/pricing",
      check: (r, o) => {
        const missing = [...LOCALES, "x-default"].filter((l) => !r.body.includes(`hrefLang="${l}" href="${o}/`));
        return { ok: r.status === 200 && missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")} on ${o}` : "all four alternates on this origin" };
      },
    },
    {
      name: "robots.txt", method: "GET", path: "/robots.txt",
      check: (r, o) => { const ok = r.status === 200 && r.body.includes("Disallow: /*/owner/") && r.body.includes(`Sitemap: ${o}/sitemap.xml`); return { ok, detail: ok ? "owner area disallowed, sitemap on this origin" : "wrong origin or missing disallow" }; },
    },
    {
      name: "sitemap.xml", method: "GET", path: "/sitemap.xml",
      check: (r, o) => { const missing = LOCALES.filter((l) => !r.body.includes(`<loc>${o}/${l}</loc>`)); return { ok: r.status === 200 && missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")}` : "three locales on this origin" }; },
    },
    {
      name: "magic-link route", method: "POST", path: "/api/owner/magic-link", body: {},
      check: (r) => ({ ok: r.status === 400, detail: r.status === 400 ? "route answers (400 on empty body)" : `${r.status} — expected 400` }),
    },
    {
      name: "google claim start", method: "GET", path: "/api/oauth/google/claim/start?slug=launchcheck",
      check: (r) => {
        const toGoogle = r.status === 302 && /accounts\.google\.com/.test(r.headers.location ?? "");
        if (claimFlagOn) return toGoogle ? { ok: true, detail: "302 to Google (redirect URI registered)" } : { ok: false, detail: `${r.status} — claim flag off or route missing (expected 302 to Google)` };
        return r.status === 404 ? { ok: true, detail: "404 (flag off, as configured)" } : { ok: false, detail: `${r.status} — expected 404 while the flag is off` };
      },
    },
    {
      name: "stripe webhook unsigned", method: "POST", path: "/api/webhooks/stripe", body: {},
      check: (r) => ({ ok: r.status === 400, detail: r.status === 400 ? "unsigned event rejected" : `${r.status} — expected 400` }),
    },
    {
      name: "fixture guard", method: "POST", path: "/api/scan/start", body: { business_name: "launch-check", market: "XX", manual_entry: true },
      check: (r) => ({ ok: r.status === 400 || r.status === 429, detail: `${r.status} — validation or rate limit answered; nothing queued` }),
    },
  ];
}

// Test helper: run() always passes the real origin; evaluate() defaults it for unit tests.
export function evaluate(probe, response, origin = "https://example.test") {
  return probe.check(response, origin);
}

function parseArgs(argv) {
  const args = { origin: "", claimFlagOn: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--origin") args.origin = (argv[i + 1] ?? "").replace(/\/+$/, "");
    if (argv[i] === "--claim-flag") args.claimFlagOn = argv[i + 1] === "on";
  }
  if (!/^https?:\/\//.test(args.origin)) throw new Error("--origin https://host is required");
  return args;
}

async function run(probe, origin) {
  const response = await fetch(`${origin}${probe.path}`, {
    method: probe.method,
    redirect: "manual",
    headers: probe.body ? { "content-type": "application/json" } : undefined,
    body: probe.body ? JSON.stringify(probe.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const headers = Object.fromEntries([...response.headers.entries()]);
  return probe.check({ status: response.status, headers, body: await response.text() }, origin);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { origin, claimFlagOn } = parseArgs(process.argv.slice(2));
  let failed = 0;
  for (const probe of buildProbes(origin, { claimFlagOn })) {
    let result;
    try {
      result = await run(probe, origin);
    } catch (error) {
      result = { ok: false, detail: `request failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!result.ok) failed += 1;
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${probe.name.padEnd(24)} ${result.detail}`);
  }
  console.log(failed ? `\n${failed} probe(s) failed` : "\nAll probes passed");
  process.exit(failed ? 1 : 0);
}
