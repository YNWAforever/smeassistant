import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { readDatabaseConfig } from "./config";
import { scopedBudgetPool, currentExecutionBudget } from "@/lib/jobs/execution-budget";
import { createBudgetPool } from "./budget-pool";

let pool: Pool | undefined;
let database: NodePgDatabase | undefined;

export function getPool(): Pool {
  const scoped = scopedBudgetPool(budget => createBudgetPool({ connectionString: readDatabaseConfig(process.env).applicationUrl, statement_timeout: budget.statementLimitMs },budget));
  if(scoped)return scoped;
  if (!pool) {
    const { applicationUrl } = readDatabaseConfig(process.env);
    pool = new Pool({ connectionString: applicationUrl, connectionTimeoutMillis: 10_000 });
    attachDatabasePool(pool);
  }
  return pool;
}

export function getDatabase(): NodePgDatabase {
  if(currentExecutionBudget())return drizzle(getPool());
  database ??= drizzle(getPool());
  return database;
}
