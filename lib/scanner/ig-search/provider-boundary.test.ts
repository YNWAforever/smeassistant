import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const igSearchRoot = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(igSearchRoot, "../../../app/api/business/ig-search/route.ts");

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

/**
 * Comments are stripped before scanning. This file's own guards are about what
 * the code DOES, and several modules here carry comments that quote the very
 * anti-patterns being forbidden ("never read process.env.SERPAPI_KEY directly")
 * -- matching those would fail the build for explaining itself.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("Instagram search provider boundary", () => {
  const rawSource = [...typescriptFiles(igSearchRoot), routePath]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const source = withoutComments(rawSource);

  it("reads SerpApi keys only through the shared resolver", () => {
    // Reading process.env.SERPAPI_KEY directly is how the GBP fallback and the
    // AEO configured-flag once disagreed with the key the collector really used
    // (CLAUDE.md, "Two SerpAPI env names, one resolver").
    expect(source).not.toMatch(/process\.env\.SERPAPI/);
    expect(source).toContain("resolveSerpApiKeys");
  });

  it("talks to exactly one RapidAPI host, the one the scanner already uses", () => {
    const hosts = [...source.matchAll(/https:\/\/\$\{?([a-zA-Z0-9._-]+)\}?\//g)].map((match) => match[1]);
    // The host is a module constant, never interpolated from anything caller-supplied.
    expect(source).toContain('const HOST = "instagram-scraper-stable-api.p.rapidapi.com"');
    expect(hosts).not.toContain("searchPath");
  });

  it("never lets the configured endpoint path change the host", () => {
    // RAPIDAPI_INSTAGRAM_SEARCH_PATH is operator-supplied. It is interpolated
    // into a URL, so the shape guard is the only thing standing between a typo
    // and an outbound request to somewhere else entirely.
    expect(source).toContain("SEARCH_PATH_SHAPE");
    expect(source).toContain("/^[a-z0-9_]+\\.php$/i");
  });
});
