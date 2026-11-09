import { Pool } from "pg";

import {
  assertPreviewIsolation,
  buildPreviewBranchPlan,
  PREVIEW_BRANCH_MAX_DAYS,
} from "../../lib/operations/preview-databases";

/**
 * `pnpm preview:db plan --pr N --slug S [--parent production] [--days N]`
 * `pnpm preview:db verify`  (reads PREVIEW_DATABASE_URL + PRODUCTION_DATABASE_URL)
 *
 * Plans a schema-only Neon preview branch or verifies that a preview database
 * URL is isolated from production. It never creates a branch; executing the
 * printed command is an owner action. URLs are never printed.
 */
const HELP = `Preview database (plan / verify)

Usage:
  pnpm preview:db plan --pr <number> --slug <slug> [--parent production] [--days ${1}-${PREVIEW_BRANCH_MAX_DAYS}]
  pnpm preview:db verify

plan   prints the schema-only Neon branch name, create/migrate/cleanup commands
verify reads PREVIEW_DATABASE_URL and PRODUCTION_DATABASE_URL, fails unless the
       preview host/database are a different branch from production, and prints
       a read-only journal check

No hosted branch is created and no URL is printed.`;

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

async function verify(): Promise<void> {
  const previewUrl = process.env.PREVIEW_DATABASE_URL;
  const productionUrl = process.env.PRODUCTION_DATABASE_URL;
  if (!previewUrl || !productionUrl) {
    console.error("PREVIEW_DATABASE_URL and PRODUCTION_DATABASE_URL are required for verify");
    process.exitCode = 2;
    return;
  }
  const isolation = assertPreviewIsolation(previewUrl, productionUrl);
  const pool = new Pool({
    connectionString: previewUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    application_name: "sme-preview-db-verify",
    options: "-c default_transaction_read_only=on",
  });
  try {
    const journal = (await pool.query<{ n: number | null }>("SELECT max(ordinal)::int AS n FROM neon_migrations.journal")).rows[0];
    console.log(JSON.stringify({
      isolated: true,
      previewHost: isolation.previewHost,
      previewDatabase: isolation.previewDatabase,
      productionHost: isolation.productionHost,
      journalMaxOrdinal: typeof journal?.n === "number" ? journal.n : null,
    }, null, 2));
  } catch (error) {
    console.error(`preview isolation verification failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

function plan(argv: string[]): void {
  const prRaw = argValue(argv, "--pr");
  const slug = argValue(argv, "--slug");
  const parent = argValue(argv, "--parent");
  const daysRaw = argValue(argv, "--days");
  if (!prRaw || !slug) throw new Error("plan requires --pr and --slug");
  if (!/^\d+$/.test(prRaw)) throw new Error("--pr must be a positive integer");
  console.log(JSON.stringify(buildPreviewBranchPlan({
    prNumber: Number(prRaw),
    slug,
    ...(parent ? { parentBranch: parent } : {}),
    ...(daysRaw ? { days: Number(daysRaw) } : {}),
  }), null, 2));
}

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  try {
    if (command === "plan") plan(argv);
    else if (command === "verify") await verify();
    else throw new Error(`unknown command: ${command}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  }
}

await main();
