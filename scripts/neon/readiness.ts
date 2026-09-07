import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { is, getTableName } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../lib/db/schema";
import { loadMigrations } from "./migrations";
import { retainedFunctions } from "./catalog";
type Env = Record<string, string | undefined>;
type Connection = {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<unknown>;
};
export type Readiness = {
  status: "ready" | "not_ready";
  category:
    | "configuration"
    | "target"
    | "connection"
    | "schema"
    | "privileges"
    | "ready";
  target?: { host: string; database: string };
};
const safeName = (value: string) => /^[a-zA-Z0-9_.-]+$/.test(value);
function configuration(env: Env) {
  const required = [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
    "APP_ORIGIN",
    "NEXT_PUBLIC_SITE_URL",
    "NEON_READINESS_HOST",
    "NEON_READINESS_DATABASE",
  ];
  if (required.some((name) => !env[name]?.trim() || env[name]?.trim() === name))
    throw new Error("configuration");
  const app = new URL(env.DATABASE_URL!),
    direct = new URL(env.DATABASE_URL_UNPOOLED!),
    auth = new URL(env.NEON_AUTH_BASE_URL!);
  for (const db of [app, direct])
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      !db.username ||
      !db.password ||
      !db.hostname ||
      !db.pathname.slice(1) ||
      db.hash
    )
      throw new Error("configuration");
  for (const db of [app, direct])
    for (const [name, value] of db.searchParams) {
      if (
        name === "sslmode" &&
        ["require", "verify-ca", "verify-full"].includes(value)
      )
        continue;
      if (name === "channel_binding" && ["require", "prefer"].includes(value))
        continue;
      throw new Error("configuration");
    }
  if (
    auth.protocol !== "https:" ||
    auth.username ||
    auth.password ||
    auth.search ||
    auth.hash ||
    env.NEON_AUTH_COOKIE_SECRET!.trim().length < 32
  )
    throw new Error("configuration");
  const origin = (text: string) => {
    const url = new URL(text);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("configuration");
    return url.origin;
  };
  if (origin(env.APP_ORIGIN!) !== origin(env.NEXT_PUBLIC_SITE_URL!))
    throw new Error("configuration");
  const host = env.NEON_READINESS_HOST!,
    database = env.NEON_READINESS_DATABASE!;
  if (!safeName(host) || !safeName(database)) throw new Error("configuration");
  // A pooled endpoint differs only by the Neon -pooler suffix.
  const canonical = (host: string) => host.replace(/-pooler(?=\.)/, "");
  if (
    (app.port || "5432") !== (direct.port || "5432") ||
    canonical(app.hostname) !== canonical(host) ||
    canonical(direct.hostname) !== canonical(host) ||
    decodeURIComponent(app.pathname.slice(1)) !== database ||
    decodeURIComponent(direct.pathname.slice(1)) !== database
  )
    throw new Error("target");
  return {
    url: direct.href,
    appUrl: env.DATABASE_URL!,
    target: { host, database },
  };
}
/** No application data queries, DDL, Auth requests, or error/URL output. */
export async function readiness(
  env: Env,
  connect: (url: string) => Promise<Connection> = async (url) => {
    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      max: 1,
    });
    return pool;
  },
): Promise<Readiness> {
  let config: ReturnType<typeof configuration>;
  try {
    config = configuration(env);
  } catch (error) {
    return {
      status: "not_ready",
      category:
        error instanceof Error && error.message === "target"
          ? "target"
          : "configuration",
    };
  }
  let db: Connection | undefined, appDb: Connection | undefined;
  let failureCategory: Readiness["category"] = "connection";
  try {
    db = await connect(config.url);
    await db.query("BEGIN READ ONLY");
    failureCategory = "schema";
    const identity = (
      await db.query(
        "SELECT current_database() AS database, current_user AS migration_role",
      )
    ).rows[0];
    if (identity?.database !== config.target.database)
      return { status: "not_ready", category: "target", target: config.target };
    const journal = (
      await db.query(
        "SELECT to_regclass('neon_migrations.journal')::text AS journal",
      )
    ).rows[0];
    if (!journal?.journal)
      return { status: "not_ready", category: "schema", target: config.target };
    const history = (
      await db.query(
        "SELECT ordinal,name,checksum FROM neon_migrations.journal ORDER BY ordinal",
      )
    ).rows;
    const migrations = await loadMigrations();
    if (
      history.length !== migrations.length ||
      history.some(
        (row, i) =>
          row.ordinal !== i + 1 ||
          row.name !== migrations[i].name ||
          row.checksum !==
            createHash("sha256").update(migrations[i].sql).digest("hex"),
      )
    )
      return { status: "not_ready", category: "schema", target: config.target };
    const tables = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .map((value) => getTableName(value as PgTable));
    const found = (
      await db.query(
        "SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'",
      )
    ).rows;
    const functions = (
      await db.query(
        "SELECT p.proname AS name FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'",
      )
    ).rows;
    if (
      tables.some((name) => !found.some((row) => row.name === name)) ||
      retainedFunctions.some(
        (name) => !functions.some((row) => row.name === name),
      )
    )
      return { status: "not_ready", category: "schema", target: config.target };
    // The direct connection proves migration history only. Exercise the exact
    // application URL independently, including its credentials and pooled host.
    failureCategory = "connection";
    appDb = await connect(config.appUrl);
    await appDb.query("BEGIN READ ONLY");
    failureCategory = "privileges";
    const runtime = (
      await appDb.query(
        `
    SELECT current_database() AS database,
      pg_has_role(current_user, 'sme_app_runtime', 'USAGE') AS runtime_member,
      has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles r
        WHERE (pg_has_role(current_user, r.oid, 'MEMBER')
          OR pg_has_role(session_user, r.oid, 'MEMBER'))
          AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole
            OR r.rolname = $1)
      ) OR EXISTS (
        SELECT 1 FROM (
          SELECT datdba AS owner FROM pg_catalog.pg_database WHERE datname=current_database()
          UNION SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname IN ('public','neon_migrations')
          UNION SELECT c.relowner FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','neon_migrations')
          UNION SELECT p.proowner FROM pg_catalog.pg_proc p
            JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','neon_migrations')
        ) owners WHERE pg_has_role(current_user, owners.owner, 'MEMBER')
          OR pg_has_role(session_user, owners.owner, 'MEMBER')
      ) AS unsafe_role,
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) privileges(name)
        WHERE n.nspname='public' AND c.relname=ANY($2::text[])
          AND NOT has_table_privilege(current_user,c.oid,privileges.name)
      ) AS table_privileges
  `,
        [identity.migration_role, tables],
      )
    ).rows[0];
    if (runtime?.database !== config.target.database)
      return { status: "not_ready", category: "target", target: config.target };
    if (
      runtime.runtime_member !== true ||
      runtime.schema_usage !== true ||
      runtime.unsafe_role !== false ||
      runtime.table_privileges !== true
    )
      return {
        status: "not_ready",
        category: "privileges",
        target: config.target,
      };
    return { status: "ready", category: "ready", target: config.target };
  } catch {
    return {
      status: "not_ready",
      category: failureCategory,
      target: config.target,
    };
  } finally {
    for (const connection of [appDb, db]) {
      if (connection) {
        try {
          await connection.query("ROLLBACK");
        } catch {}
        await connection.end().catch(() => {});
      }
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await readiness(process.env);
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "ready" ? 0 : 1;
}
