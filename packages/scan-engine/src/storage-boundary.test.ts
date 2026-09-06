import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
it("keeps execution source free of database clients and host credentials", () => {
  for (const file of readdirSync(new URL(".", import.meta.url)).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  )) {
    expect(
      readFileSync(new URL(file, import.meta.url), "utf8"),
      file,
    ).not.toMatch(
      /@supabase|from ["']pg["']|POSTHOG_KEY|SUPABASE_SERVICE_ROLE_KEY|from ["']sharp["']/,
    );
  }
});
