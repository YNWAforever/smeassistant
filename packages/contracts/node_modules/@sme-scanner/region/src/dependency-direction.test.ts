import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// lib/region is the LEAF of the region <-> i18n dependency, and must stay that way:
//   i18n/routing.ts     imports resolveServedLocales from lib/region/config.ts
//   i18n/navigation.ts  re-imports ./routing
//   i18n/request.ts     re-imports ./routing
// so an import of ANY i18n module from inside lib/region closes a circular
// dependency — directly for routing, one hop later for navigation/request.
//
// apps/web/eslint.config.mjs carries a no-restricted-imports rule for this, but its
// pattern list only names i18n/routing, so the navigation/request hops slip past it.
// This test covers the whole directory. If the ESLint pattern is later widened to
// "@/i18n/*", this stays as defence in depth — it also survives the lint config
// being removed or misconfigured.
const REGION_DIR = dirname(fileURLToPath(import.meta.url));

// Matches: from "@/i18n...", from "../../i18n...", import("@/i18n..."), etc.
// The forbidden segment is matched anywhere inside the string literal -- not
// anchored to a fixed prefix -- so any relative depth is caught, including
// "../../../apps/web/i18n/routing" (the only form still reachable now that
// this file lives in packages/region/src rather than apps/web/lib/region).
// The trailing "/" or closing quote after "i18n" keeps this from matching an
// unrelated identifier that merely contains the substring "i18n" (e.g. a
// hypothetical "i18n-utils" module would NOT match, since nothing in this
// package legitimately names a file that way).
const I18N_IMPORT = /(?:from|import|require)\s*\(?\s*["'][^"']*\bi18n(?:\/[^"']*)?["']/;

describe("lib/region dependency direction", () => {
  const sources = readdirSync(REGION_DIR).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
  );

  it("finds the lib/region sources to check", () => {
    // Guards against the glob silently matching nothing and the suite passing vacuously.
    expect(sources.length).toBeGreaterThan(0);
    expect(sources).toContain("config.ts");
  });

  it.each(sources)("%s does not import from i18n/", (file) => {
    const offending = readFileSync(join(REGION_DIR, file), "utf8")
      .split("\n")
      .map((line, i) => ({ line: line.trim(), lineNumber: i + 1 }))
      .filter(({ line }) => I18N_IMPORT.test(line));

    expect(
      offending,
      `lib/region/${file} imports from i18n/, which closes a circular dependency: ` +
        `i18n/routing.ts imports resolveServedLocales from lib/region/config.ts, and ` +
        `i18n/navigation.ts + i18n/request.ts both re-import ./routing. ` +
        "Declare the locale union locally instead — see the `Loc` type in lib/region/config.ts.",
    ).toEqual([]);
  });
});
