import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * pnpm's virtual store folder names stay short enough for Turbopack on Windows.
 *
 * With Windows long paths off (LongPathsEnabled = 0, the default), Turbopack
 * cannot read a dependency file whose full path passes ~275 characters, while
 * Node and webpack can. pnpm's default store folder names run to 120
 * characters, so from a worktree under `.claude/worktrees/<name>` the radix-ui
 * packages crossed that line and the literal `next build` failed with
 * "Module not found: Can't resolve '@radix-ui/react-…'" (5 errors, growing to
 * 45 as worktree names lengthened). Capping folder names at 60 characters keeps
 * the longest radix path near 230. CI and Vercel install fresh on Linux, where
 * the setting changes only folder names.
 *
 * Raising the cap above 60 brings the Windows failure back; change this test in
 * the same PR only with a measured reason.
 */
const npmrcPath = fileURLToPath(new URL("../.npmrc", import.meta.url));

function npmrcSettings(): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const raw of readFileSync(npmrcPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    settings[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return settings;
}

describe("pnpm virtual store folder length", () => {
  it("has a repo-level .npmrc", () => {
    expect(existsSync(npmrcPath)).toBe(true);
  });

  it("caps virtual-store-dir-max-length at 60 or less", () => {
    const value = Number(npmrcSettings()["virtual-store-dir-max-length"]);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThanOrEqual(60);
  });
});
