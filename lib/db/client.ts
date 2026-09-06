import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { readDatabaseConfig } from "./config";

let pool: Pool | undefined;
let database: NodePgDatabase | undefined;

export function getPool(): Pool {
  if (!pool) {
    const { applicationUrl } = readDatabaseConfig(process.env);
    pool = new Pool({ connectionString: applicationUrl });
    attachDatabasePool(pool);
  }
  return pool;
}

export function getDatabase(): NodePgDatabase {
  database ??= drizzle(getPool());
  return database;
}