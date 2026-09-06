import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("blocks legacy demo seeding before loading any database dependency", () => {
  const source = readFileSync(
    new URL("../scripts/seed-demo.ts", import.meta.url),
    "utf8",
  );
  expect(source).toContain("demo_seed_neon_migration_pending");
  expect(source).not.toMatch(/^import /m);
});
