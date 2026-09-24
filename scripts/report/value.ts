import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { assertDatabaseUrl, assertTarget } from "../neon/target";
import { lastCompleteWeek, parseIsoWeek, type ReportWeek } from "./week";
import { collectValueReport, type ValueReport } from "./value-queries";
import { formatText } from "./format";

type Env = Record<string, string | undefined>;
export type ReportFailure = "configuration" | "target" | "query_failed";

/**
 * Fixed categories, no connection strings or SQL in the message. The cause is
 * kept for the operator's terminal -- this is a CLI they run themselves -- except
 * where the cause could itself contain the URL and therefore the password.
 */
export class ReportError extends Error {
  readonly category: ReportFailure;
  constructor(category: ReportFailure, options?: { cause?: unknown }) {
    super(category, options);
    this.name = "ReportError";
    this.category = category;
  }
}

export interface ReportConfig {
  url: string;
  target: { host: string; database: string };
  week: ReportWeek;
  json: boolean;
}

export function configure(env: Env, argv: string[], now: Date = new Date()): ReportConfig {
  const raw = env.DATABASE_URL?.trim();
  const host = env.VALUE_REPORT_HOST?.trim();
  const database = env.VALUE_REPORT_DATABASE?.trim();
  if (!raw || !host || !database) throw new ReportError("configuration");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // No cause: Node attaches the unparseable input to the error, and that
    // input is the connection string.
    throw new ReportError("configuration");
  }
  try {
    assertDatabaseUrl(url);
    assertTarget([url], host, database);
  } catch (cause) {
    throw new ReportError(cause instanceof Error && cause.message === "target" ? "target" : "configuration", { cause });
  }

  let week = lastCompleteWeek(now);
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--week") {
      const value = argv[++i];
      if (!value) throw new ReportError("configuration");
      try {
        week = parseIsoWeek(value);
      } catch (cause) {
        throw new ReportError("configuration", { cause });
      }
      continue;
    }
    throw new ReportError("configuration");
  }
  return { url: raw, target: { host, database }, week, json };
}

export async function runReport(
  config: ReportConfig,
  connect: (url: string) => Pick<Pool, "connect" | "end"> = (url) =>
    new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000, query_timeout: 30_000 }),
): Promise<ValueReport> {
  const pool = connect(config.url);
  try {
    const client = await pool.connect();
    try {
      // Enforced by Postgres: any write inside this transaction is rejected.
      await client.query("BEGIN TRANSACTION READ ONLY");
      // A URL can parse correctly and still land elsewhere; neon:readiness
      // makes the same check after connecting.
      const identity = (await client.query<{ database: string }>("SELECT current_database() AS database")).rows[0];
      if (identity?.database !== config.target.database) throw new ReportError("target");
      return await collectValueReport(client, config.week);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  } catch (cause) {
    if (cause instanceof ReportError) throw cause;
    throw new ReportError("query_failed", { cause });
  } finally {
    await pool.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = configure(process.env, process.argv.slice(2));
    const report = await runReport(config);
    console.log(config.json ? JSON.stringify(report, null, 2) : formatText(report));
  } catch (error) {
    console.error(`report:value failed: ${error instanceof ReportError ? error.category : "query_failed"}`);
    if (error instanceof Error && error.cause) console.error(error.cause);
    process.exitCode = 1;
  }
}
