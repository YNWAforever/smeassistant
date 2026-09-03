import { dockerAvailable, startContainers } from "./docker";
import { applySchema } from "./schema";
import { mintServiceRoleJwt } from "./jwt";

const JWT_SECRET = "sme-scanner-integration-jwt-secret-32b";

export default async function setup() {
  if (!dockerAvailable()) {
    // Skipping loudly is the point. A harness that silently passes when it
    // tested nothing is the exact failure this suite exists to catch.
    throw new Error(
      "Integration tests require Docker, which is not available.\n" +
        "Start Docker Desktop and re-run, or run `pnpm test` for the unit suite only.",
    );
  }

  const containers = await startContainers(JWT_SECRET);

  // startContainers cleans up only the failures it raises itself. Past that
  // point the teardown returned below is the sole thing that stops the
  // containers, and a throw here means Vitest never receives it — applySchema
  // throws on any migration that will not apply, which would strand postgres
  // and postgrest on the developer's machine to be removed by hand.
  try {
    const containerSuffix = process.pid.toString(36);
    applySchema(containerSuffix);

    // PostgREST exposes `public` only, so a test needing a row in auth.users --
    // which every staff-owned table references -- cannot seed one through
    // supabase-js. Publishing the suffix lets such a test reach execSql.
    process.env.INTEGRATION_DB_SUFFIX = containerSuffix;

    const token = mintServiceRoleJwt(JWT_SECRET);
    process.env.NEXT_PUBLIC_SUPABASE_URL = containers.postgrestUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = token;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = token;
    // request-fingerprint.ts throws outside NODE_ENV=test without this.
    process.env.RATE_LIMIT_SECRET = "integration-rate-limit-secret";
  } catch (error) {
    containers.stop();
    throw error;
  }

  return () => containers.stop();
}
