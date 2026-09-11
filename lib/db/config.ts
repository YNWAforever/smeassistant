export interface DatabaseConfig {
  applicationUrl: string;
  migrationUrl?: string;
}

// scripts/neon/readiness.ts checks this too, but only as a separate read-only
// deploy-time probe -- it never runs against the actual request-serving pool
// (lib/db/client.ts's getPool()), so a URL that passed readiness once could
// still drift and serve traffic with no verified TLS. Enforcing it here,
// where the real pool reads its connection string, closes that gap.
const SECURE_SSLMODES = new Set(["require", "verify-ca", "verify-full"]);

function requireSecureSslModeInProduction(url: URL): void {
  if (process.env.NODE_ENV !== "production") return;
  const sslmode = url.searchParams.get("sslmode");
  if (!sslmode || !SECURE_SSLMODES.has(sslmode)) throw new Error("database_configuration_insecure");
}

function validatedPostgresUrl(value: string | undefined, missingAllowed = false): string | undefined {
  const candidate = value?.trim();
  if (!candidate) {
    if (missingAllowed) return undefined;
    throw new Error("database_configuration_missing");
  }
  try {
    const url = new URL(candidate);
    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !url.hostname || !url.pathname.slice(1)) throw new Error("invalid");
    requireSecureSslModeInProduction(url);
  } catch (error) {
    if (error instanceof Error && error.message === "database_configuration_insecure") throw error;
    throw new Error("database_configuration_invalid");
  }
  return candidate;
}

export function readDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  const applicationUrl = validatedPostgresUrl(env.DATABASE_URL)!;
  const migrationUrl = validatedPostgresUrl(env.DATABASE_URL_UNPOOLED, true);
  return migrationUrl ? { applicationUrl, migrationUrl } : { applicationUrl };
}