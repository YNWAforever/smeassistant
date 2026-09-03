import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSql } from "./docker";

// Ported from sme-scanner (b9b4151f) apps/web/test/integration/schema.ts. The
// upstream monorepo keeps supabase/ four levels up from apps/web/test/integration;
// here the migration corpus lives at the repo root, two levels up. package.json is
// "type": "module", so the directory comes from import.meta.url rather than
// __dirname (vitest shims the latter, tsx does not).
const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

/**
 * Objects Supabase provides that a bare Postgres does not. The list was worked
 * out by supabase/verify-migrations.sh, which applied the corpus to an empty
 * cluster until it stopped failing — with one deliberate divergence from it:
 * service_role carries `bypassrls` here and plain `nologin` there.
 *
 * That script runs every statement as the `postgres` superuser, which bypasses
 * RLS implicitly, so the grant never matters to it. PostgREST instead SETs the
 * role named in the JWT, and every scanner table enables RLS with zero policies
 * — which denies all rows to any role that is neither the table owner nor
 * BYPASSRLS. Drop `bypassrls` and the suite reads back nothing at all.
 */
const SUPABASE_SHIMS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
-- PostgREST connects as postgres and SETs the role named in the JWT, which
-- requires postgres to be a member of it.
grant service_role to postgres;
grant anon to postgres;

create schema auth;
create schema extensions;
create schema storage;
create extension pgcrypto with schema extensions;
create extension if not exists pgcrypto;

create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
`;

/** PostgREST caches the schema at boot; it must be told once the tables exist. */
const RELOAD_SCHEMA_CACHE = `notify pgrst, 'reload schema';`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export function applySchema(containerSuffix: string): void {
  execSql(containerSuffix, SUPABASE_SHIMS);

  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      execSql(containerSuffix, sql);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`migration ${file} failed to apply: ${detail}`);
    }
  }

  // The migrations revoke public access and grant to service_role explicitly;
  // PostgREST needs usage on the schema itself to expose anything at all.
  execSql(containerSuffix, `grant usage on schema public to anon, service_role;`);
  execSql(containerSuffix, RELOAD_SCHEMA_CACHE);
}
