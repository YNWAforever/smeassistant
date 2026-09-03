import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // This glob is what makes untested files count. Vitest 4 dropped the old
      // `coverage.all` flag: an explicit `include` now measures every matching
      // file, imported by a test or not. Leave it off and a file no test
      // reaches is silently omitted rather than reported at 0% — which is how
      // src/prompts.ts stayed invisible until this glob surfaced it as dead
      // n8n-era code, deleted in the same change that added this config.
      include: ["src/**/*.ts"],
      // index.ts is not a barrel here — it holds WEIGHTS and scoreAll, the
      // package's whole reason to exist — so it stays in the measured set.
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "html"],
      // Measured floor on 2026-08-11 (90.37 / 76.76 / 97.72 / 92.23). This
      // package is pure and fully unit-testable, so it carries the higher bar.
      thresholds: { statements: 90, branches: 76, functions: 95, lines: 92 },
    },
  },
});
