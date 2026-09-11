import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Next.js allows an App Router `route.ts` to export only its HTTP method
 * handlers and a fixed set of config values, and it type-checks that against
 * generated `.next/types/**` during `next build` -- a gate that only runs after
 * the bundler has compiled, so a violation shows up as a late build failure
 * rather than as a typecheck error.
 *
 * Three had accumulated (`sameOrigin`, `parseClaimBody`, a re-exported
 * `cleanCallbackHandoff`), every one of them exported purely so a test could
 * import it. Helpers belong in a sibling module or in lib/; this keeps that
 * mistake cheap to catch.
 */
const ALLOWED = new Set([
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
  "dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime",
  "preferredRegion", "maxDuration", "generateStaticParams", "config", "default",
]);

const appDir = fileURLToPath(new URL("../app", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" || entry.name === "route.tsx" ? [path] : [];
  });
}

/** Both `export function x` / `export const x` and `export { x } from "..."`. */
function exportedNames(source: string): string[] {
  const names: string[] = [];
  const declaration = /^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface)\s+([A-Za-z0-9_$]+)/gm;
  const named = /^export\s*\{([^}]*)\}/gm;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(source))) names.push(match[1]);
  while ((match = named.exec(source))) {
    for (const part of match[1].split(",")) {
      const alias = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (alias) names.push(alias);
    }
  }
  return names;
}

describe("App Router route files", () => {
  it("export only handlers and Next's own config values", () => {
    const offenders = routeFiles(appDir)
      .map((file) => ({ file: relative(repoRoot, file), extra: exportedNames(readFileSync(file, "utf8")).filter((name) => !ALLOWED.has(name)) }))
      .filter((entry) => entry.extra.length);
    expect(offenders).toEqual([]);
  });

  it("finds the route files it claims to be checking", () => {
    // A guard that silently matches nothing is worse than no guard.
    expect(routeFiles(appDir).length).toBeGreaterThan(20);
  });
});
