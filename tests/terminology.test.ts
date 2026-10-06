import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * FA-12: the product term is 能見度 (visibility). The stray variant had drifted
 * into the zh-HK report module label, share/meta strings, the landing page and
 * the LLM summary prompt. This keeps shipped source at zero occurrences;
 * historical docs are not scanned.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const SCANNED = ["app", "components", "lib", "packages"];
const SKIP = new Set(["node_modules", ".next", "dist", "coverage"]);
const EXTENSIONS = /\.(ts|tsx|json|mjs|css)$/;
// Built from code points so this file does not match itself.
const STRAY = String.fromCodePoint(0x53ef, 0x898b, 0x5ea6);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.test(entry)) out.push(full);
  }
  return out;
}

describe("terminology", () => {
  it("uses 能見度, never the stray variant, in shipped source", () => {
    const offenders = SCANNED.flatMap((dir) => walk(path.join(root, dir)))
      .filter((file) => readFileSync(file, "utf8").includes(STRAY))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});
