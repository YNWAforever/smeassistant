import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// packages/scan-engine exists so a future Cloudflare Worker can import the exact
// scan-execution code apps/web uses today (see
// docs/superpowers/specs/2026-08-21-scan-execution-cloudflare-split-design.md).
// That only works if this package never pulls in `sharp`, a native binding that
// cannot run on Cloudflare Workers under any compatibility flag. `sharp` lives in
// apps/web/lib/evidence/safe-media.ts, imported by apps/web/lib/evidence/persist.ts
// -- so those two files must never be imported from this package's source, in any
// form: aliased (`@/lib/evidence/persist`), relative
// (`../../../apps/web/lib/evidence/persist`), at any relative depth, via
// `require()`, via a dynamic `import()`, or from inside a type position.
//
// This package declares no `@/*` mapping at all: tsconfig.json has no `paths`
// and vitest.config.ts no `resolve.alias`. Both once carried a single
// `@/lib/supabase` entry, deleted once the last runtime reach-back into
// apps/web was gone. So an ALIASED import of `@/lib/evidence/persist` cannot
// resolve here under either tool. But a RELATIVE import bypasses
// `paths`/`alias` config entirely -- tsc and bundlers resolve a correct
// relative path regardless of what a tsconfig says -- and this package still
// legitimately uses that exact relative style (`../../../apps/web/...`) for
// its type-only imports: EvidenceCandidate in execution.ts, processor.ts and
// provider-result.ts, RawData in gbp-collector.ts and collect-providers.ts.
// Those are erased before bundling; a value import of evidence/persist would
// not be. This test is the only thing that catches the relative form; it
// checks the literal path SEGMENT "evidence/persist" / "evidence/safe-media"
// rather than any fixed prefix, so it catches every relative depth and the
// aliased form alike.
const SCAN_ENGINE_DIR = dirname(fileURLToPath(import.meta.url));

// Matches: from "../../../apps/web/lib/evidence/persist", from "@/lib/evidence/persist",
// import("../evidence/safe-media"), require("./evidence/persist"), a dynamic
// type-position import (`import("...").Foo`), etc. The forbidden segment is
// matched anywhere inside the string literal so any relative depth is caught,
// while "evidence/types" (a different, legitimately-imported file) never matches.
const EVIDENCE_MEDIA_IMPORT =
  /(?:from|import|require)\s*\(?\s*["'][^"']*\bevidence\/(?:persist|safe-media)\b[^"']*["']/;

describe("scan-engine evidence/media boundary", () => {
  // Test files are excluded: they legitimately might reference the forbidden
  // path in a comment or (like this file) in the guard itself, without that
  // counting as a violation. Only non-test source is asserted never to import
  // evidence/persist or evidence/safe-media.
  const sources = readdirSync(SCAN_ENGINE_DIR).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
  );

  it("finds the scan-engine sources to check", () => {
    // Guards against the glob silently matching nothing and the suite passing vacuously.
    expect(sources.length).toBeGreaterThan(0);
    expect(sources).toContain("execution.ts");
  });

  it.each(sources)("%s does not import evidence/persist or evidence/safe-media", (file) => {
    const offending = readFileSync(join(SCAN_ENGINE_DIR, file), "utf8")
      .split("\n")
      .map((line, i) => ({ line: line.trim(), lineNumber: i + 1 }))
      .filter(({ line }) => EVIDENCE_MEDIA_IMPORT.test(line));

    expect(
      offending,
      `packages/scan-engine/src/${file} imports apps/web/lib/evidence/persist.ts or ` +
        "safe-media.ts. Both pull in `sharp`, a native binding that cannot run on " +
        "Cloudflare Workers under any compatibility flag -- and the entire point of " +
        "packages/scan-engine is to be importable from a future Cloudflare Worker " +
        "(see docs/superpowers/specs/2026-08-21-scan-execution-cloudflare-split-design.md). " +
        "This package declares no `@/*` alias, so the aliased form cannot resolve -- " +
        "but a RELATIVE import (the same style this package still uses for its " +
        "type-only reach-backs into apps/web) resolves by the filesystem and " +
        "bypasses resolver config entirely. " +
        "If you need evidence data here, import " +
        "apps/web/lib/evidence/types.ts instead (pure types, no sharp) and take a " +
        "persistence function as an injected dependency -- see " +
        "ScanExecutionRuntime['persistEvidence'] in execution.ts for the established " +
        "pattern.",
    ).toEqual([]);
  });
});
