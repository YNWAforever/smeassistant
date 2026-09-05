// Public reachability and negative-boundary checks only. Never sends credentials,
// valid scan inputs, valid email inputs or signed payment events.
// Usage: node scripts/launch-check.mjs --origin https://host
//   [--canonical-origin https://expected-host] [--claim-flag on|off]
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const LOCALES = ["zh-HK", "en", "zh-TW"];
const verdict = (ok, detail) => ({ ok, status: ok ? "passed" : "failed", detail });

// Use the existing dev dependency as a parser only: scripts and resource
// fetching remain disabled. Inert template/raw-text content is not metadata.
function tags(body, name) {
  const dom = new JSDOM(body);
  try {
    const document = dom.window.document;
    const nodes = name === "html" ? [document.documentElement] : [...document.head.querySelectorAll("link")];
    return nodes.map((node) => Object.fromEntries([...node.attributes].map((attr) => [attr.name.toLowerCase(), attr.value])));
  } finally { dom.window.close(); }
}

function sitemapLocations(body) {
  let dom;
  try {
    dom = new JSDOM(body, { contentType: "text/xml" });
    return [...dom.window.document.querySelectorAll("urlset > url > loc")].map((node) => node.textContent.trim());
  } catch { return []; }
  finally { dom?.window.close(); }
}

function jsonError(response) {
  try { return JSON.parse(response.body)?.error; } catch { return undefined; }
}

function rejection(status, error, detail) {
  return (r) => verdict(r.status === status && jsonError(r) === error,
    r.status === status && jsonError(r) === error ? detail : `${r.status} — expected ${status} ${error}`);
}

export function buildProbes(origin, { claimFlagOn = false, canonicalOrigin = origin } = {}) {
  return [
    ...LOCALES.map((locale) => ({
      name: `locale page ${locale}`, category: "public reachability", method: "GET", path: `/${locale}`,
      check: (r) => {
        const ok = r.status === 200 && tags(r.body, "html").some((tag) => tag.lang?.toLowerCase() === locale.toLowerCase());
        return verdict(ok, ok ? `200, lang ${locale}` : `${r.status} — expected 200 and html lang ${locale}`);
      },
    })),
    {
      name: "canonical URL", category: "public metadata", method: "GET", path: "/zh-HK/pricing",
      check: (r, expected = canonicalOrigin) => {
        const links = tags(r.body, "link").filter((tag) => tag.rel?.toLowerCase() === "canonical");
        const ok = r.status === 200 && links.length === 1 && links[0].href === `${expected}/zh-HK/pricing`;
        return verdict(ok, ok ? "canonical matches expected origin and path" : `${r.status} — missing or wrong canonical URL on ${expected}`);
      },
    },
    {
      name: "hreflang alternates", category: "public metadata", method: "GET", path: "/zh-HK/pricing",
      check: (r, expected = canonicalOrigin) => {
        const links = tags(r.body, "link").filter((tag) => tag.rel?.toLowerCase() === "alternate");
        const missing = [...LOCALES, "x-default"].filter((locale) => {
          const matches = links.filter((tag) => tag.hreflang?.toLowerCase() === locale.toLowerCase());
          return matches.length !== 1 || matches[0].href !== `${expected}/${locale === "x-default" ? "zh-HK" : locale}/pricing`;
        });
        return verdict(r.status === 200 && missing.length === 0, r.status !== 200 ? `${r.status} — expected 200` : missing.length ? `missing or wrong ${missing.join(", ")} on ${expected}` : "all four alternates match expected origin and paths");
      },
    },
    {
      name: "robots.txt", category: "public metadata", method: "GET", path: "/robots.txt",
      check: (r, expected = canonicalOrigin) => {
        const lines = r.body.split(/\r?\n/).map((line) => line.trim());
        const ok = r.status === 200 && lines.includes("Disallow: /*/owner/") && lines.includes(`Sitemap: ${expected}/sitemap.xml`);
        return verdict(ok, ok ? "owner area disallowed, sitemap matches expected origin" : `${r.status} — wrong origin or missing disallow`);
      },
    },
    {
      name: "sitemap.xml", category: "public metadata", method: "GET", path: "/sitemap.xml",
      check: (r, expected = canonicalOrigin) => {
        const locations = sitemapLocations(r.body);
        const missing = LOCALES.filter((locale) => !locations.includes(`${expected}/${locale}`));
        return verdict(r.status === 200 && missing.length === 0, r.status !== 200 ? `${r.status} — expected 200` : missing.length ? `missing ${missing.join(", ")} on ${expected}` : "three locale URLs match expected origin");
      },
    },
    {
      name: "magic-link input rejection", category: "request validation", method: "POST", path: "/api/owner/magic-link", body: {},
      check: rejection(400, "invalid_email", "empty email rejected; email delivery and redemption not tested"),
    },
    {
      name: "google claim start", category: "authentication boundary", method: "GET", path: "/api/oauth/google/claim/start?slug=launchcheck",
      check: (r) => r.status === 503
        ? verdict(false, "503 — claim configuration unavailable")
        : claimFlagOn
          ? rejection(401, "unauthenticated", "anonymous request rejected; OAuth consent and callback not tested")(r)
          : rejection(404, "not_found", "claim route hidden with flag off; OAuth not tested")(r),
    },
    {
      name: "stripe unsigned signature rejection", category: "signature rejection", method: "POST", path: "/api/webhooks/stripe", body: {},
      check: rejection(400, "Missing stripe-signature header", "missing signature rejected; signed delivery and entitlements not tested"),
    },
    {
      name: "scan invalid-market rejection", category: "request validation", method: "POST", path: "/api/scan/start",
      body: { business_name: "launch-check", market: "XX", manual_entry: true },
      check: rejection(400, "market must be HK or TW", "invalid market rejected; fixture mode and scan execution not tested"),
    },
  ];
}

export function evaluate(probe, response, origin) {
  if (response.status === 429) return { ok: false, status: "blocked", detail: "429 — rate limit observed; intended check not reached" };
  return probe.check(response, origin);
}

// For a separately authorized authenticated test with an approved job/session.
// This evaluator does not send a request and is never part of the public CLI.
export function evaluateAuthenticatedClaimRedirect(response) {
  let target;
  try { target = new URL(response.headers.location ?? ""); } catch { /* invalid redirect */ }
  const ok = [302, 307].includes(response.status) && target?.origin === "https://accounts.google.com" &&
    !target.username && !target.password && target.pathname === "/o/oauth2/v2/auth";
  return verdict(ok, ok ? "app constructed a Google consent redirect; registration, consent and ownership not verified" : `${response.status} — expected an authenticated Google consent redirect`);
}

function parseOrigin(value, option) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new Error(`${option} requires a bare http(s) origin without credentials, path, query or fragment`); }
}

export function parseArgs(argv) {
  const args = { origin: "", canonicalOrigin: "", claimFlagOn: false };
  for (let i = 0; i < argv.length; i += 2) {
    const option = argv[i];
    const value = argv[i + 1];
    if (option === "--origin") args.origin = parseOrigin(value, option);
    else if (option === "--canonical-origin") args.canonicalOrigin = parseOrigin(value, option);
    else if (option === "--claim-flag" && ["on", "off"].includes(value)) args.claimFlagOn = value === "on";
    else throw new Error(`invalid option or value: ${option}`);
  }
  if (!args.origin) throw new Error("--origin https://host is required");
  args.canonicalOrigin ||= args.origin;
  return args;
}

export async function runProbe(probe, origin, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const response = await fetchImpl(`${origin}${probe.path}`, {
    method: probe.method, redirect: "manual", credentials: "omit",
    headers: probe.body ? { "content-type": "application/json" } : undefined,
    body: probe.body ? JSON.stringify(probe.body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return evaluate(probe, { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() });
}

export async function main(argv, { fetchImpl = fetch, log = console.log, timeoutMs = 15000 } = {}) {
  let args;
  try { args = parseArgs(argv); } catch (error) { log(error.message); return 1; }
  log(`Request origin: ${args.origin}; expected canonical origin: ${args.canonicalOrigin}`);
  let failed = 0;
  for (const probe of buildProbes(args.origin, args)) {
    let result;
    try { result = await runProbe(probe, args.origin, { fetchImpl, timeoutMs }); }
    catch (error) { result = verdict(false, `request failed: ${error instanceof Error ? error.message : String(error)}`); }
    if (!result.ok) failed += 1;
    log(`${result.status.toUpperCase()}  [${probe.category}] ${probe.name}: ${result.detail}`);
  }
  log(failed ? `${failed} public check(s) failed or blocked` : "All public checks passed");
  log("Authenticated/provider acceptance: not run (OAuth registration/consent/claim, email redemption, signed payments, actual scans and merchant journeys).");
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
