import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated output of the workspace packages and the test tooling.
    "packages/**/dist/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      // packages/* are vendored verbatim from the sme-scanner upstream, which
      // lints with core-web-vitals only; its untyped third-party JSON boundary
      // (SerpApi / RapidAPI / Places) is typed as `any` on purpose.
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-assign-module-variable": "off",
    },
  },
]);

export default eslintConfig;
