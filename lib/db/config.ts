export interface DatabaseConfig {
  applicationUrl: string;
  migrationUrl?: string;
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
  } catch {
    throw new Error("database_configuration_invalid");
  }
  return candidate;
}

export function readDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  const applicationUrl = validatedPostgresUrl(env.DATABASE_URL)!;
  const migrationUrl = validatedPostgresUrl(env.DATABASE_URL_UNPOOLED, true);
  return migrationUrl ? { applicationUrl, migrationUrl } : { applicationUrl };
}