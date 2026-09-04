# Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve `smescanner.fimmick.com` from this app for HK and TW, proven by a live smoke test on the same build, with reversible cut-over.

**Architecture:** Four small code changes (accessibility, production fixture guard, legacy path redirects, a read-only launch-check script) land first under the normal gate. Then a staged rollout through the Vercel connector: configure the existing `smeassistant` project, deploy production to its `vercel.app` URL, verify each external registration with the check script, run the smoke test, move the domain, verify again. Rollback is moving the domain back.

**Tech Stack:** Next.js 16 (`proxy.ts` request interception), Vitest 4, Node 22 ESM script with native `fetch`, Vercel MCP connector, Lighthouse via the Chrome DevTools connector.

**Spec:** `docs/superpowers/specs/2026-09-04-launch-readiness-design.md`. **Branch:** `feat/launch-readiness` (on top of `feat/phase-7-hardening`).

**Conventions:** run every command from the repo root `C:\Users\laich\Documents\smeassistant` with `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0`. Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Shell heredocs must stay under ~4 KB per command. Never paste a secret into chat, a file or a commit.

---

## File structure

| File | Responsibility |
|---|---|
| `components/product-ui.tsx` (PublicHeader, ~line 241) | brand link `aria-label` |
| `app/ramp-refresh.css` (~line 204) | header CTA colour with enough specificity to beat the utility classes |
| `lib/scan/run.ts` + `lib/scan/run.test.ts` | `resolveScanSourceMode` production guard |
| `lib/funnel/locale-redirect.ts` + `tests/proxy.test.ts` | `resolveLegacyRedirect` (pure rule) |
| `proxy.ts` | one call to the legacy rule before the locale rule, 308 |
| `scripts/launch-check.mjs` + `tests/launch-check.test.ts` | read-only probes + parsers; `package.json` script `launch:check` |
| `docs/integration/DEPLOY.md` | runbook with the real ids and hostnames |
| `docs/integration/LAUNCH-REPORT.md` | record of the rollout (ids only) |

---

### Task 1: Accessibility fixes

**Files:**
- Modify: `components/product-ui.tsx:241`
- Modify: `app/ramp-refresh.css:204-209`

- [ ] **Step 1: Measure the current computed colour (do not guess)**

Start a production server and read the CTA's computed style through the Chrome DevTools connector:

```bash
corepack pnpm exec next build > /dev/null 2>&1 && (corepack pnpm exec next start -p 3016 > /tmp/p.log 2>&1 &) ; sleep 8; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3016/zh-HK
```

Then `new_page` on `http://127.0.0.1:3016/zh-HK` and `evaluate_script` with:

```js
(() => { const a = document.querySelector(".header-actions a.header-scan-cta"); const s = getComputedStyle(a); return { color: s.color, background: s.backgroundColor, classes: a.className }; })()
```

Expected: `background` is `rgb(202, 243, 106)`. Record `color`; if it is `rgb(255, 255, 255)` the utility class wins the cascade and Step 2 applies. If it is already `rgb(23, 32, 25)`, Lighthouse measured a hover or transition state; Step 2 still applies because it also pins `:hover`.

- [ ] **Step 2: Pin the CTA text colour with higher specificity**

In `app/ramp-refresh.css` replace the `.header-scan-cta` block with:

```css
.public-header .header-actions .header-scan-cta,
.public-header .header-actions .header-scan-cta:hover,
.public-header .header-actions .header-scan-cta:focus-visible {
  border-color: var(--lime) !important;
  background: var(--lime) !important;
  color: #172019 !important;
  box-shadow: 0 8px 18px rgba(88, 118, 35, .16);
}
```

Leave `.header-scan-cta svg { width: 15px; }` as is.

- [ ] **Step 3: Make the brand link's accessible name contain its visible text**

The visible text is "SME Scanner" plus the caption "by Fimmick" (with a space between them — add `{" "}` between the `<strong>` and `<small>` so the DOM text reads "SME Scanner by Fimmick"). In `components/product-ui.tsx` line 241 change the `aria-label` to:

```tsx
<Link className="brand-lockup" href={`/${locale}`} aria-label={isChinese ? "SME Scanner by Fimmick · 主頁" : "SME Scanner by Fimmick · home"}>
```

- [ ] **Step 4: Rebuild, re-run Lighthouse on the three surfaces**

```bash
PID=$(netstat -ano | grep -E 'TCP.*:3016 .*LISTENING' | awk '{print $NF}' | head -1); [ -n "$PID" ] && taskkill //F //PID "$PID" >/dev/null 2>&1; corepack pnpm exec next build 2>&1 | grep -E "Compiled|Error"; (corepack pnpm exec next start -p 3016 > /tmp/p.log 2>&1 &); sleep 8
```

`lighthouse_audit` (desktop, navigation) on `/zh-HK`, `/zh-HK/sample-report`, `/zh-HK/demo-workspace`.
Expected: accessibility ≥ 96 on all three, and neither `color-contrast` for `.header-scan-cta` nor `label-content-name-mismatch` for `.brand-lockup` in the failed audits. Check with:

```bash
node -e "const r=require(process.argv[1]);const ids=r.categories.accessibility.auditRefs.map(a=>a.id).filter(id=>{const a=r.audits[id];return a.score!==null&&a.score<1});console.log(ids.join(', ')||'none')" <report.json path printed by the audit>
```

- [ ] **Step 5: Run the gate and commit**

```bash
corepack pnpm exec tsc --noEmit && corepack pnpm exec eslint components/product-ui.tsx && corepack pnpm exec vitest run tests 2>&1 | grep -E "Test Files|Tests |FAIL"
git add components/product-ui.tsx app/ramp-refresh.css
git commit -m "fix: header CTA contrast and brand link accessible name

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: Production fixture guard

**Files:**
- Modify: `lib/scan/run.ts` (`resolveScanSourceMode`, ~line 27)
- Test: `lib/scan/run.test.ts` (`describe("resolveScanSourceMode")`)

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe("resolveScanSourceMode", …)` block in `lib/scan/run.test.ts`:

```ts
  it("refuses fixtures on a Vercel production deployment and falls back to live", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(resolveScanSourceMode({ SCAN_SOURCES: "fixture", VERCEL_ENV: "production", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe("live");
      expect(error).toHaveBeenCalledWith("[scan] SCAN_SOURCES=fixture is not allowed in production; using live", { category: "scan_sources_fixture_in_production" });
    } finally {
      error.mockRestore();
    }
  });

  it("still allows fixtures on preview deployments and locally", () => {
    expect(resolveScanSourceMode({ SCAN_SOURCES: "fixture", VERCEL_ENV: "preview", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe("fixture");
    expect(resolveScanSourceMode({ SCAN_SOURCES: "fixture", NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)).toBe("fixture");
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `corepack pnpm exec vitest run lib/scan/run.test.ts -t "production deployment"`
Expected: FAIL — received `"fixture"`, expected `"live"`.

- [ ] **Step 3: Implement the guard**

In `lib/scan/run.ts` replace `resolveScanSourceMode` with:

```ts
export function resolveScanSourceMode(env: NodeJS.ProcessEnv = process.env): ScanSourceMode {
  const raw = env.SCAN_SOURCES?.trim().toLowerCase();
  if (raw === "fixture" && env.VERCEL_ENV === "production") {
    // A preview setting copied into production would ship fixture scans to
    // merchants. Fail towards live evidence and say so loudly.
    console.error("[scan] SCAN_SOURCES=fixture is not allowed in production; using live", { category: "scan_sources_fixture_in_production" });
    return "live";
  }
  if (raw === "live" || raw === "fixture") return raw;
  if (raw) console.warn("[scan] SCAN_SOURCES not recognised, using the default", { category: "scan_sources_unrecognised" });
  return env.NODE_ENV === "test" ? "fixture" : "live";
}
```

- [ ] **Step 4: Run the file's tests**

Run: `corepack pnpm exec vitest run lib/scan/run.test.ts`
Expected: all pass (the existing "honours an explicit SCAN_SOURCES value" case sets `NODE_ENV: "production"` without `VERCEL_ENV`, so it still returns `fixture`).

- [ ] **Step 5: Commit**

```bash
git add lib/scan/run.ts lib/scan/run.test.ts
git commit -m "fix: refuse fixture scans on production deployments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: Legacy path redirects

**Files:**
- Modify: `lib/funnel/locale-redirect.ts` (add `resolveLegacyRedirect` after `resolveLocaleRedirect`)
- Modify: `proxy.ts` (`proxy()` function, before the locale redirect)
- Test: `tests/proxy.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/proxy.test.ts` (it already imports from `@/lib/funnel/locale-redirect`; add `resolveLegacyRedirect` to that import list):

```ts
describe("resolveLegacyRedirect", () => {
  it("maps the legacy merchant paths to their new homes, keeping an explicit locale", () => {
    expect(resolveLegacyRedirect("/owner")).toBe("/zh-HK/owner/select-workspace");
    expect(resolveLegacyRedirect("/en/owner")).toBe("/en/owner/select-workspace");
    expect(resolveLegacyRedirect("/privacy")).toBe("/zh-HK/legal/privacy");
    expect(resolveLegacyRedirect("/zh-TW/terms")).toBe("/zh-TW/legal/terms");
    expect(resolveLegacyRedirect("/scanner")).toBe("/zh-HK/scan");
    expect(resolveLegacyRedirect("/en/scanner")).toBe("/en/scan");
  });

  it("leaves every other path alone, including the new routes themselves", () => {
    expect(resolveLegacyRedirect("/zh-HK/owner/select-workspace")).toBeNull();
    expect(resolveLegacyRedirect("/zh-HK/legal/privacy")).toBeNull();
    expect(resolveLegacyRedirect("/zh-HK/owner/kam-man-house")).toBeNull();
    expect(resolveLegacyRedirect("/scan")).toBeNull();
    expect(resolveLegacyRedirect("/")).toBeNull();
    expect(resolveLegacyRedirect("/api/scan/start")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `corepack pnpm exec vitest run tests/proxy.test.ts -t "resolveLegacyRedirect"`
Expected: FAIL — `resolveLegacyRedirect` is not exported.

- [ ] **Step 3: Implement the pure rule**

Append to `lib/funnel/locale-redirect.ts`:

```ts
/**
 * Paths the legacy sme-scanner app served that live elsewhere here. Bookmarks
 * and search results keep working after the domain moves. A locale prefix is
 * honoured when present; otherwise the default locale applies. Returns the
 * target for a 308, or null when the path is not a legacy one.
 */
const LEGACY_PATHS: Record<string, string> = {
  owner: "/owner/select-workspace",
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  scanner: "/scan",
};

export function resolveLegacyRedirect(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const locale = segments[0] && isLocale(segments[0]) ? segments[0] : null;
  const rest = locale ? segments.slice(1) : segments;
  if (rest.length !== 1) return null;
  const target = LEGACY_PATHS[rest[0]];
  return target ? `/${locale ?? DEFAULT_LOCALE}${target}` : null;
}
```

- [ ] **Step 4: Wire it into the proxy**

In `proxy.ts`, import `resolveLegacyRedirect` alongside the existing imports from `@/lib/funnel/locale-redirect`, and add this as the first statement inside `proxy()` that handles the pathname (before `resolveLocaleRedirect` is consulted):

```ts
  const legacy = resolveLegacyRedirect(pathname);
  if (legacy) {
    const url = request.nextUrl.clone();
    url.pathname = legacy;
    return NextResponse.redirect(url, 308);
  }
```

- [ ] **Step 5: Run the proxy tests and the typecheck**

Run: `corepack pnpm exec vitest run tests/proxy.test.ts && corepack pnpm exec tsc --noEmit`
Expected: all proxy tests pass (the existing `proxy()` tests are unaffected because none of their paths are legacy paths); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add lib/funnel/locale-redirect.ts proxy.ts tests/proxy.test.ts
git commit -m "feat: redirect legacy sme-scanner merchant paths

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: Launch readiness check script

**Files:**
- Create: `scripts/launch-check.mjs`
- Create: `tests/launch-check.test.ts`
- Modify: `package.json` (`scripts.launch:check`)

The script is pure ESM with exported functions so the parsers are unit-testable; the CLI runs only when the file is the entry point.

- [ ] **Step 1: Write the failing parser tests**

Create `tests/launch-check.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to see it fail**

Run: `corepack pnpm exec vitest run tests/launch-check.test.ts`
Expected: FAIL — cannot find module `../scripts/launch-check.mjs`.

- [ ] **Step 3: Write the probes and the evaluator**

Create `scripts/launch-check.mjs` (first half; the CLI is added in Step 4):

```js
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

export function evaluate(probe, response, origin = "https://example.test") {
  return probe.check(response, origin);
}
```

Note on the last probe: `market: "XX"` fails upstream validation with 400 before any insert; it exists to prove the route is reachable and rate-limited on the real origin, not to run a scan.

- [ ] **Step 4: Add the CLI (second half of the same file)**

Append to `scripts/launch-check.mjs`:

```js
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
```

- [ ] **Step 5: Add the package script and run the tests**

```bash
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('package.json','utf8'));j.scripts['launch:check']='node scripts/launch-check.mjs';fs.writeFileSync('package.json',JSON.stringify(j,null,2)+'\n');"
corepack pnpm exec vitest run tests/launch-check.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Try it against a local production server**

```bash
corepack pnpm exec next build > /dev/null 2>&1; (corepack pnpm exec next start -p 3016 > /tmp/p.log 2>&1 &); sleep 8
corepack pnpm launch:check --origin http://127.0.0.1:3016 --claim-flag off; echo "exit=$?"
PID=$(netstat -ano | grep -E 'TCP.*:3016 .*LISTENING' | awk '{print $NF}' | head -1); [ -n "$PID" ] && taskkill //F //PID "$PID" >/dev/null 2>&1
```

Expected locally (no env): locale pages PASS; `hreflang alternates`, `robots.txt` and `sitemap.xml` FAIL with "wrong origin" because `NEXT_PUBLIC_SITE_URL` is unset (they print `http://localhost:3000`); `magic-link route` PASS or FAIL 503 (no `RATE_LIMIT_SECRET`) — either is fine locally; `google claim start` PASS (404, flag off); `stripe webhook unsigned` PASS; `fixture guard` PASS. Exit code 1 is expected here; the point is that every line prints a reason.

- [ ] **Step 7: Lint and commit**

```bash
corepack pnpm exec eslint scripts/launch-check.mjs tests/launch-check.test.ts
git add scripts/launch-check.mjs tests/launch-check.test.ts package.json
git commit -m "feat: add read-only launch readiness check

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: Gate, docs, and the code PR

**Files:**
- Modify: `docs/integration/DEPLOY.md` (top of file, after the title)

- [ ] **Step 1: Record the real ids in the runbook**

Insert after the first paragraph of `docs/integration/DEPLOY.md`:

```markdown
## Where things are (observed 2026-09-04)

| Item | Value |
|---|---|
| Vercel team | `ynwaforevers-projects` (`team_qvzlsFmfCsLkgItSypqHjw3z`, Hobby) |
| This app's project | `smeassistant` (`prj_Hbox4o4NhM3p0yxRxmY8Xq1mjtb5`), linked to `YNWAforever/smeassistant`, production branch `main` |
| Legacy project | `sme-scanner` (`prj_zKzNcbLTwlSXbhYTMe59spRQh1BC`), custom domain `smescanner.fimmick.com`, staff hostname `sme-scanner-one.vercel.app` |
| Public hostname after cut-over | `smescanner.fimmick.com` → `smeassistant` (domain moved in Vercel; DNS unchanged) |
| Pre-cut-over production origin | `https://smeassistant.vercel.app` |

## Cut-over runbook

1. `corepack pnpm launch:check --origin https://smeassistant.vercel.app --claim-flag on` — all probes pass except none; fix registrations first.
2. Live smoke test (both markets) recorded in `docs/integration/LAUNCH-REPORT.md`.
3. In Vercel: remove `smescanner.fimmick.com` from `sme-scanner`, add it to `smeassistant`. Wait for the certificate.
4. `corepack pnpm launch:check --origin https://smescanner.fimmick.com --claim-flag on` — all probes pass.
5. Rollback at any point: move the domain back. No data step exists in either direction.
```

- [ ] **Step 2: Run the full gate**

```bash
corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test 2>&1 | grep -E "Test Files|Tests |FAIL" && corepack pnpm build 2>&1 | grep -E "Compiled|Error" && corepack pnpm e2e 2>&1 | grep -E "passed|failed|skipped" && corepack pnpm test:secret-boundary 2>&1 | grep -E "Secret boundary|failed"
```

Expected: typecheck clean, 0 lint errors, all tests pass (suite, isolated decoder file, packages), build green, Playwright 27 passed / 4 skipped, secret boundary passed.

- [ ] **Step 3: Commit, push, open the PR**

```bash
git add docs/integration/DEPLOY.md
git commit -m "docs: cut-over runbook with the real Vercel ids

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/launch-readiness
gh pr create --base main --head feat/launch-readiness --title "Launch readiness: a11y fixes, production guard, legacy redirects, launch check" --body "See docs/superpowers/specs/2026-09-04-launch-readiness-design.md. Code only; the rollout steps run after merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: PR opened; CI green. Willy merges PR #3 (Phase 7) first if it is still open, then this one. Tasks 6–9 run against `main` after merge.

### Task 6: Configure the Vercel project (connector)

No repo files. Executed through the Vercel MCP connector; every result is verified with `get_project` and noted in `docs/integration/LAUNCH-REPORT.md` (Task 9).

- [ ] **Step 1: Project settings** — set on `smeassistant`: Node 22.x, root `/`, install `pnpm install --frozen-lockfile`, build `pnpm build`, production branch `main`, deployment protection off for production. Verify with `get_project` (`nodeVersion` = `22.x`).
- [ ] **Step 2: Preview environment** — set for the Preview scope: `SCAN_SOURCES=fixture`, `NEXT_PUBLIC_SITE_URL` unset (the app falls back to `VERCEL_URL`), `APP_ORIGIN` = `https://smeassistant-git-main-ynwaforevers-projects.vercel.app` (mailed preview links only), `RATE_LIMIT_SECRET` (Willy pastes), the three Supabase variables (Willy pastes). No provider, LLM or payment keys.
- [ ] **Step 3: Production environment** — set for the Production scope every non-secret value: `SCAN_SOURCES=live`, `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true`, `NEXT_PUBLIC_SITE_URL=https://smescanner.fimmick.com`, `APP_ORIGIN=https://smescanner.fimmick.com`, `GOOGLE_OAUTH_REDIRECT_URI=https://smescanner.fimmick.com/api/oauth/google/callback`, `GOOGLE_OAUTH_CLAIM_REDIRECT_URI=https://smescanner.fimmick.com/api/oauth/google/claim/callback`, `NEXT_PUBLIC_REGION` unset, `POSTHOG_HOST` as in `.env.example`. Willy pastes every secret from the legacy project's production environment: Supabase, `RATE_LIMIT_SECRET`, `REPORT_ACCESS_TOKEN_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`, provider keys, LLM key, `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, Stripe keys and price ids, Google client id and secret. Claude then lists the configured variable names and diffs them against `.env.example` — every non-comment key must be present or consciously blank.
- [ ] **Step 4: Deploy production from `main`** and run `corepack pnpm launch:check --origin https://smeassistant.vercel.app --claim-flag on`. Expected before the domain move: the three locale pages pass; `hreflang alternates`, `robots.txt` and `sitemap.xml` FAIL with "wrong origin" because they print the final hostname (`NEXT_PUBLIC_SITE_URL`), which is intended and clears itself in Task 8; `google claim start` fails until Task 7 step 2; `stripe webhook unsigned` passes once the secret is set; `magic-link route` passes. Record the output.

### Task 7: External registrations (Willy), verified one by one

No repo files. Each step is: Willy performs the registration → Claude runs the probe → the result is recorded.

- [ ] **Step 1: Supabase Auth redirect allowlist** — Willy adds `https://smescanner.fimmick.com/auth/callback` and `https://smeassistant.vercel.app/auth/callback`. Claude verifies: on `https://smeassistant.vercel.app/zh-HK/owner/sign-in` request a magic link for a lead that exists on a test report slug; Willy confirms the mailed link opens `/auth/callback` on the `vercel.app` origin and lands on `/zh-HK/owner/select-workspace` signed in.
- [ ] **Step 2: Google Cloud OAuth client** — Willy adds redirect URIs `/api/oauth/google/callback` and `/api/oauth/google/claim/callback` on both origins and both origins as JavaScript origins. Claude verifies: `corepack pnpm launch:check --origin https://smeassistant.vercel.app --claim-flag on` shows `google claim start  PASS 302 to Google`.
- [ ] **Step 3: Stripe webhook** — Willy adds endpoint `https://smescanner.fimmick.com/api/webhooks/stripe` and `https://smeassistant.vercel.app/api/webhooks/stripe`, pastes the signing secret into the Production env, and sends a test `checkout.session.completed` from the dashboard. Claude verifies: the Vercel runtime logs (`get_runtime_logs`) show a 200 for the test event and the unsigned probe still reports 400.
- [ ] **Step 4: Workspace migrations** — Willy applies `supabase/migrations/20260903000000_workspace_layer.sql` then `20260903000001_workspace_rpcs.sql` in the SQL editor on a non-production project, then production, in that order. Claude verifies with a read-only query Willy runs: `select count(*) from public.scan_snapshots; select proname from pg_proc where proname in ('approve_output_version','export_output_version');` — two function names returned.

### Task 8: Live smoke test and cut-over

No repo files. Stops at the first failure; nothing later runs.

- [ ] **Step 1: Smoke test, Hong Kong** — on `https://smeassistant.vercel.app/zh-HK`: `/scan` manual entry for a real HK business → scanning completes → `/r/<slug>` shows a score or an honest withheld state with coverage → unlock with a test contact → sign in by magic link → `/owner/onboarding?claim=<slug>` → Verify with Google → onboarding step 4 → workspace home shows the snapshot → Actions lists derived actions → generate a draft (or the template fallback if the LLM key is absent) → approve → export → usage shows 1 delivery. Record job id, share slug, workspace slug, version no.
- [ ] **Step 2: Smoke test, Taiwan** — same path on `/zh-TW` with a real TW business (market TW; LINE contact channel on unlock).
- [ ] **Step 3: Move the domain** — in Vercel remove `smescanner.fimmick.com` from `sme-scanner` and add it to `smeassistant`; wait for the certificate (`get_project` domains list shows it; `curl -sI https://smescanner.fimmick.com/zh-HK` returns 200).
- [ ] **Step 4: Verify on the public hostname** — `corepack pnpm launch:check --origin https://smescanner.fimmick.com --claim-flag on` → "All probes passed". Then `curl -sI https://smescanner.fimmick.com/owner | grep -i location` → 308 to `/zh-HK/owner/select-workspace`; `curl -sI https://smescanner.fimmick.com/privacy | grep -i location` → `/zh-HK/legal/privacy`.
- [ ] **Step 5: Legacy stays for staff** — `curl -sI https://sme-scanner-one.vercel.app/` returns 200 (legacy app still up on its own hostname). Willy confirms the staff console works there.
- [ ] **Rollback (only if Step 4 or the first hour of traffic fails)** — move the domain back to `sme-scanner`; re-run `launch:check` on the legacy origin is not needed; announce.

### Task 9: Launch report

**Files:**
- Create: `docs/integration/LAUNCH-REPORT.md`

- [ ] **Step 1: Write the record** — sections: Vercel settings applied (Task 6), env variable names present (no values), each registration with its probe output (Task 7), smoke-test log with ids (Task 8), cut-over timestamp, `launch:check` output on the public hostname, open items (product decisions still assumed, design-owned follow-ups, staff console still legacy).
- [ ] **Step 2: Commit on `main` via a small PR**

```bash
git checkout -b docs/launch-report main && git add docs/integration/LAUNCH-REPORT.md && git commit -m "docs: launch report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin docs/launch-report && gh pr create --base main --head docs/launch-report --title "docs: launch report" --body "Record of the rollout; no code.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
