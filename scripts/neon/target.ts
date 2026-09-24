/**
 * Database-target checks shared by every script that connects to a real
 * database (neon:readiness, report:value). One copy, because two copies of a
 * safety check drift apart. Errors carry only a fixed category -- never a URL,
 * which would include the password.
 */
export const safeName = (value: string) => /^[a-zA-Z0-9_.-]+$/.test(value);

/** A pooled Neon endpoint differs from the direct one only by -pooler. */
export const canonicalHost = (host: string) => host.replace(/-pooler(?=\.)/, "");

/** Throws "configuration" unless `db` is a credentialed postgres URL with only accepted TLS parameters. */
export function assertDatabaseUrl(db: URL): void {
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    !db.username ||
    !db.password ||
    !db.hostname ||
    !db.pathname.slice(1) ||
    db.hash
  )
    throw new Error("configuration");
  for (const [name, value] of db.searchParams) {
    if (name === "sslmode" && ["require", "verify-ca", "verify-full"].includes(value)) continue;
    if (name === "channel_binding" && ["require", "prefer"].includes(value)) continue;
    throw new Error("configuration");
  }
}

/**
 * Throws "configuration" for an unsafe host/database name, and "target" unless
 * every URL points at that host and database on one shared port.
 */
export function assertTarget(urls: URL[], host: string, database: string): void {
  if (!safeName(host) || !safeName(database)) throw new Error("configuration");
  const port = (url: URL) => url.port || "5432";
  const first = urls[0];
  if (
    !first ||
    urls.some(
      (url) =>
        port(url) !== port(first) ||
        canonicalHost(url.hostname) !== canonicalHost(host) ||
        decodeURIComponent(url.pathname.slice(1)) !== database,
    )
  )
    throw new Error("target");
}
