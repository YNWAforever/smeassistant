import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { scoreAll } from "@sme-scanner/scoring";
import type { AuditPayload } from "@sme-scanner/scoring";

describe("competitor data does not touch scoring", () => {
  it("keeps scoringVersion where the 2026-08-16 design pinned it", () => {
    // Spec §7: comparability was reset twice in six days, and every reset
    // restarts the trend series Phase 3's diff depends on. Deliberately a
    // literal, not an imported constant (packages/scoring has no exported
    // SCORING_VERSION) -- matching index.test.ts:109's precedent, so bumping
    // the version requires a conscious edit to this assertion too.
    // Bumped 2026-08-02 -> 2026-08-16: IG and GBP moved from binary threshold
    // deductions to continuous curves against a derived target for 11 of their
    // 17 checks, changing what score most payloads produce.
    const payload: AuditPayload = {
      business_name: "測試餐廳",
      industry: "餐飲",
      district: "灣仔",
      ig: { available: true, followers: 100, posts_last_12: [] },
      gbp: { available: false },
      aeo: { available: false, serpapi_runs: [] },
    };

    const result = scoreAll(payload);

    expect(result.scoringVersion).toBe("2026-08-16");
  });
});

describe("merchant-performance-panel stays unmounted", () => {
  it("is referenced by no app source at all", () => {
    // Spec D3: it consumes unsanitized MerchantPerformanceEvidence, so mounting
    // it would route provider data around sanitizeReportProof. Upstream keeps
    // the panel file plus its own test; this app never ported it (CLAUDE.md
    // 1.2), so the expected importer list is empty rather than the panel's test.
    const root = path.resolve(__dirname, "../..");
    const importers: string[] = [];
    // packages/* are vendored verbatim and carry their own guards; the rest are
    // build output and dependency stores that would only slow the walk down.
    const SKIP = new Set(["node_modules", ".next", "coverage", ".git", "packages", ".pnpm-store-cli", "playwright-report", "test-results"]);

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (entry.name === "merchant-performance-panel.tsx") continue;
        // This file's own source necessarily contains the string "merchant-performance-panel"
        // (it names the panel to skip it and to describe the assertion) -- that is a
        // self-reference from writing the guard, not an import, so exclude it the same
        // way the panel's own file is excluded above.
        if (entry.name === "competitor-invariance.test.ts") continue;
        if (readFileSync(full, "utf8").includes("merchant-performance-panel")) importers.push(path.relative(root, full));
      }
    };
    walk(root);

    expect(importers).toEqual([]);
  });
});
