import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Ported from sme-scanner (b9b4151f) apps/web/vitest.integration.config.ts.
// Same alias set as vitest.config.ts: `@` is the repo root and "server-only" is
// stubbed so server-side repositories can be imported from a test worker.
const repoRoot = path.dirname(fileURLToPath(import.meta.url));
process.env.NEON_INTEGRATION = "1";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/*.integration.test.ts"],
    // packages/* run their own vitest via `pnpm -r test`; Playwright owns e2e/.
    exclude: ["node_modules/**", ".next/**", "e2e/**", "packages/**"],
    // Every integration case uses owned PostgreSQL; missing Docker fails the gate.
    setupFiles: ["./test/e2e/transport-guard.cjs"],
    globalSetup: ["./test/integration/global-setup.ts"],
    // Containers are shared across files; parallel writes to the same tables
    // would make assertions order-dependent.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": repoRoot,
      "server-only": path.join(repoRoot, "tests/empty-module.ts"),
    },
  },
});
