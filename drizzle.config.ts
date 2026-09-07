import { defineConfig } from "drizzle-kit";

// SQL migrations own functions, permissions, and the checksummed journal.
// This configuration supports schema inspection/generation, never automatic push.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./neon/drizzle-generated",
  strict: true,
  verbose: false,
});
