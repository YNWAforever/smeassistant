import { mergeConfig } from "vitest/config";
import base from "./vitest.config";

// No globalSetup: the explicitly approved host process owns the single fixture.
const merged = mergeConfig(base, { test: {
  setupFiles: ["./test/e2e/transport-guard.cjs"],
  retry: 0, maxWorkers: 1, fileParallelism: false, testTimeout: 120_000, hookTimeout: 120_000,
} });

// mergeConfig concatenates arrays, so include must replace the root unit globs
// after merging the aliases/plugins and other shared options.
const config = { ...merged, test: { ...merged.test,
  include: ["test/integration/owner-check-real.acceptance.ts"],
} };
export default config;
