import { Pool } from "pg";

import { buildStudioUsageReport, parseStudioUsageArgs } from "../../lib/operations/studio-usage";

/**
 * `pnpm ops:studio-usage [--days N] [--workspace-id UUID]`
 *
 * Read-only operational report over persisted Studio rows. It requires the
 * runtime/operator DATABASE_URL in the environment, opens a READ ONLY
 * transaction and never selects message content. Output is JSON.
 */
const HELP = `Studio usage (read-only)

Usage: pnpm ops:studio-usage [--days N] [--workspace-id UUID]

  --days N             window length in days (1-${365}, default 30)
  --workspace-id UUID  scope to one workspace (default: all)
  -h, --help           show this text

The report counts conversations, user/assistant turns, failed turns, tokens,
cost, adjacent-turn latency and daily activity. Message text is never read.`;

async function main(): Promise<void> {
  const { options, help } = parseStudioUsageArgs(process.argv.slice(2));
  if (help) {
    console.log(HELP);
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set; this read-only report needs the operator database URL.");
    process.exitCode = 2;
    return;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
    application_name: "sme-studio-usage",
  });
  const client = await pool.connect();
  try {
    // A read-only transaction makes an accidental write fail instead of reaching production.
    await client.query("BEGIN READ ONLY");
    const report = await buildStudioUsageReport(client, options);
    await client.query("ROLLBACK");
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* already closed */ }
    console.error(`studio usage report failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
