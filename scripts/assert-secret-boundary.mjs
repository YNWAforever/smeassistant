// Client secret boundary sweep (CLAUDE.md §6, Appendix B `test:secret-boundary`).
//
// Ported from upstream's scripts/assert-merchant-search-secret-boundary.mjs and
// widened for this app: every server-only secret is set to a unique sentinel,
// the production bundle is built, and every artifact a browser can fetch
// (client chunks, rendered HTML/RSC) is scanned for the sentinels and for the
// env-var names themselves. A hit names the offending artifact and secret.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const uuid = () => crypto.randomUUID();

const sentinels = {
  SERPAPI_API_KEY: `serpapi-secret-${uuid()}`,
  RAPIDAPI_INSTAGRAM_KEY: `rapidapi-instagram-secret-${uuid()}`,
  GOOGLE_OAUTH_CLIENT_SECRET: `google-oauth-secret-${uuid()}`,
  // Must be valid base64 decoding to >= 32 bytes or token-crypto throws during
  // the build and the sweep fails for the wrong reason.
  OAUTH_TOKEN_ENCRYPTION_KEY: Buffer.from(`oauth-encryption-sentinel-${uuid()}`).toString("base64"),
  SUPABASE_SERVICE_ROLE_KEY: `service-role-secret-${uuid()}`,
  RATE_LIMIT_SECRET: `rate-limit-secret-${uuid()}`,
  STRIPE_SECRET_KEY: `stripe-secret-${uuid()}`,
  STRIPE_WEBHOOK_SECRET: `stripe-webhook-secret-${uuid()}`,
  RESEND_API_KEY: `resend-secret-${uuid()}`,
  OPENROUTER_API_KEY: `openrouter-secret-${uuid()}`,
};

execFileSync("corepack", ["pnpm", "exec", "next", "build"], {
  cwd: root,
  env: { ...process.env, SERPAPI_KEY: sentinels.SERPAPI_API_KEY, ...sentinels },
  stdio: "inherit",
  shell: process.platform === "win32",
});

const publicExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".rsc", ".txt"]);
const roots = [resolve(root, ".next/static"), resolve(root, ".next/server/app"), resolve(root, ".next/server/pages")];

function publicArtifacts(path, includeJavaScript) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return publicArtifacts(child, includeJavaScript);
    const extension = extname(entry.name);
    if (!publicExtensions.has(extension)) return [];
    if (!includeJavaScript && [".js", ".map", ".json"].includes(extension)) return [];
    return [child];
  });
}

const files = [
  ...publicArtifacts(roots[0], true),
  ...publicArtifacts(roots[1], false),
  ...publicArtifacts(roots[2], false),
];

if (!files.length) throw new Error("No client/static or rendered public artifacts were found");

const forbidden = [
  ...Object.entries(sentinels).flatMap(([name, value]) => [
    { label: `${name} value`, pattern: value },
    { label: `${name} env name`, pattern: name },
  ]),
  { label: "legacy server key name", pattern: "SERPAPI_KEY" },
  { label: "provider URL with API key", pattern: /https:\/\/serpapi\.com\/search\.json\?[^\s"']*api_key=/i },
  { label: "raw merchant-search server error", pattern: /(?:stack(?:trace)?|Error:)[^\n]{0,200}(?:serpapi|merchant[_ -]search)/i },
];

const leaks = [];
for (const file of files) {
  const contents = readFileSync(file, "utf8");
  for (const item of forbidden) {
    const found = typeof item.pattern === "string" ? contents.includes(item.pattern) : item.pattern.test(contents);
    if (found) leaks.push(`${relative(root, file)}: ${item.label}`);
  }
}

if (leaks.length) {
  throw new Error(`Client secret boundary failed:\n${leaks.join("\n")}`);
}

console.log(`Secret boundary passed across ${files.length} public artifacts.`);
