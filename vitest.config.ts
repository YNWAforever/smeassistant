import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// package.json is "type": "module", so there is no __dirname here; derive the
// repo root from import.meta.url instead (path.dirname drops the trailing
// separator that fileURLToPath(new URL(".", ...)) would leave on the alias).
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": repoRoot,
      // Server-only application repositories throw outside React Server Components.
      "server-only": path.join(repoRoot, "tests/empty-module.ts"),
    },
  },
  test: {
    // Transform the pinned SDK so Next request context can be fixture-mocked.
    server: { deps: { inline: ["@neondatabase/auth"] } },
    // Node by default. Vitest 4 removed `environmentMatchGlobs`, so DOM tests
    // opt in per file with a `// @vitest-environment jsdom` comment at the top.
    environment: "node",
    // One retry absorbs timer-bound flakiness under full parallel load (lib/evidence/safe-media.test.ts); a real failure still fails twice.
    retry: 1,
    // test/integration holds the owned Docker harness; its unit tests run here,
    // while *.integration.test.ts files use the dedicated SQL configuration.
    include: ["components/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    // Playwright owns e2e/; packages/* run their own vitest via `pnpm -r test`;
    // *.integration.test.ts needs Docker and belongs to vitest.integration.config.ts.
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**", "packages/**", "**/*.integration.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
