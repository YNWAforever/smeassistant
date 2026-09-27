import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { COMMERCIAL_CONTRACT } from "./contract";

/**
 * `neon/migrations/0004_atomic_operations.sql` is immutable (CLAUDE.md §3):
 * its `export_output_version` function cannot read `COMMERCIAL_CONTRACT` at
 * runtime, so it carries its own copy of the lite allowance for the
 * `workspace_usage` row it lazily creates on first export
 * (`case when ws_tier = 'paid' then null else 3 end`, ~line 465). This test
 * reads that literal statically out of the migration file and fails closed
 * if it and `COMMERCIAL_CONTRACT.tiers.lite.deliveryAllowance` ever
 * disagree -- changing the contract's allowance therefore needs a new
 * migration that replaces the function, not just an edit here.
 */
function readMigration(): string {
  return readFileSync(
    fileURLToPath(new URL("../../neon/migrations/0004_atomic_operations.sql", import.meta.url)),
    "utf8",
  );
}

const WS_TIER_PAID_CASE = /case\s+when\s+ws_tier\s*=\s*'paid'\s+then\s+null\s+else\s+(\d+)\s+end/gi;

describe("0004_atomic_operations.sql allowance literal", () => {
  it("matches exactly once, mapping paid to null and lite to the contract's allowance", () => {
    const sql = readMigration();
    const matches = [...sql.matchAll(WS_TIER_PAID_CASE)];
    expect(matches).toHaveLength(1);

    const [, liteLiteral] = matches[0];
    expect(Number(liteLiteral)).toBe(COMMERCIAL_CONTRACT.tiers.lite.deliveryAllowance);
    expect(COMMERCIAL_CONTRACT.tiers.paid.deliveryAllowance).toBeNull();
  });
});
