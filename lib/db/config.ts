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
  const modes = url.searchParams.getAll("sslmode");
  const compatibility = url.searchParams.getAll("uselibpqcompat");
  // URLSearchParams.get reads the first value, while pg keeps the last.
  // pg also reparses a nested connectionString after parsing the outer URL.
  // Reject those ambiguities before the driver can override the checked TLS.
  if (modes.length !== 1 || !SECURE_SSLMODES.has(modes[0])
    || compatibility.length > 1 || url.searchParams.has("connectionString")
    || (compatibility[0] === "true" && modes[0] !== "verify-full")) {
    throw new Error("database_configuration_insecure");
  }
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
  return withExplicitVerifyFull(candidate);
}

// pg-connection-string v2 already treats sslmode=require and verify-ca as
// verify-full, and logs a SECURITY WARNING on every pool start saying so
// (it surfaced as the most frequent "error" in the Vercel runtime logs).
// Spelling out the mode pg applies keeps the TLS behaviour identical and
// removes the noise. Only true enables libpq semantics; those explicit choices
// remain untouched outside production and must use verify-full in production.
function withExplicitVerifyFull(candidate: string): string {
  const url = new URL(candidate);
  const sslmode = url.searchParams.get("sslmode");
  if (process.env.NODE_ENV === "production") {
    // Force WHATWG query serialization even for verify-full. pg's legacy
    // parser re-encodes the whole URL if it sees raw spaces or malformed '%',
    // which otherwise hides an encoded sslmode key from its TLS configuration.
    url.searchParams.set("sslmode", "verify-full");
    return url.href;
  }
  if ((sslmode !== "require" && sslmode !== "verify-ca") || url.searchParams.get("uselibpqcompat") === "true") return candidate;
  // Parse and serialize instead of matching the raw text: percent-encoded
  // parameter names/values must receive the same canonical driver options.
  url.searchParams.set("sslmode", "verify-full");
  return url.href;
}

export function readDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  const applicationUrl = validatedPostgresUrl(env.DATABASE_URL)!;
  const migrationUrl = validatedPostgresUrl(env.DATABASE_URL_UNPOOLED, true);
  return migrationUrl ? { applicationUrl, migrationUrl } : { applicationUrl };
}
