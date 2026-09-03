import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Ported from sme-scanner (b9b4151f) apps/web/vitest.integration.config.ts.
// Same alias set as vitest.config.ts: `@` is the repo root and "server-only" is
// stubbed so lib/supabase/admin.ts can be imported from a test worker.
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    // packages/* run their own vitest via `pnpm -r test`; Playwright owns e2e/.
    exclude: ["node_modules/**", ".next/**", "e2e/**", "packages/**"],
    globalSetup: ["./test/integration/global-setup.ts"],
    // Runs per worker, which is the point: supabase-js is constructed inside the
    // tests and inside lib/supabase/admin.ts, and on Node 20 it throws without a
    // WebSocket global. See websocket-shim.ts.
    setupFiles: ["./test/integration/websocket-shim.ts"],
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
