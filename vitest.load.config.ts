import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Opt-in Studio load harness (Phase 19 P19.1). It is deliberately NOT part of
// `pnpm test` or CI: it starts an owned PostgreSQL fixture, runs a bounded
// concurrency ladder and writes a JSON record. Run it with `pnpm load:studio`.
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/load/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "e2e/**", "packages/**", "docs/**"],
    // Forbid outbound transport; the owned loopback PostgreSQL fixture is allowed.
    setupFiles: ["./test/e2e/transport-guard.cjs"],
    fileParallelism: false,
    // One fixture start plus the full ladder; a stalled Docker daemon fails loudly.
    testTimeout: 300_000,
    hookTimeout: 300_000,
    retry: 0,
  },
  resolve: {
    alias: {
      "@": repoRoot,
      "server-only": path.join(repoRoot, "tests/empty-module.ts"),
    },
  },
});
