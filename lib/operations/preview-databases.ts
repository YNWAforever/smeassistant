import type { Pool } from "pg";

/**
 * Preview database strategy (v1.1 P2.2).
 *
 * Preview deployments must never read or write production business rows. The
 * recommended target is a Neon **schema-only** branch created from production:
 * structure without data, one branch per PR, with an expiry and a cleanup step.
 * This module only plans and verifies isolation; it never creates a branch or
 * touches a hosted database.
 */

export const PREVIEW_BRANCH_PREFIX = "preview-pr";
export const PREVIEW_BRANCH_DEFAULT_DAYS = 14;
export const PREVIEW_BRANCH_MAX_DAYS = 30;

export type PreviewBranchPlan = {
  branchName: string;
  parentBranch: string;
  schemaOnly: true;
  expiresAt: string;
  createCommand: string;
  migrateCommand: string;
  envKeys: string[];
  cleanupCommand: string;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalisePreviewSlug(slug: string): string {
  const value = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/g, "");
  if (!value || !SLUG.test(value)) throw new Error("slug must contain letters or digits and be at most 24 characters");
  return value;
}

export function previewBranchName(prNumber: number, slug: string): string {
  if (!Number.isInteger(prNumber) || prNumber < 1 || prNumber > 999_999) throw new Error("prNumber must be an integer from 1 to 999999");
  return `${PREVIEW_BRANCH_PREFIX}-${prNumber}-${normalisePreviewSlug(slug)}`;
}

/** A deterministic, copy-pasteable plan; executing the commands is an owner action. */
export function buildPreviewBranchPlan(input: {
  prNumber: number;
  slug: string;
  parentBranch?: string;
  days?: number;
  now?: Date;
}): PreviewBranchPlan {
  const days = input.days ?? PREVIEW_BRANCH_DEFAULT_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > PREVIEW_BRANCH_MAX_DAYS) {
    throw new Error(`days must be an integer from 1 to ${PREVIEW_BRANCH_MAX_DAYS}`);
  }
  const parentBranch = (input.parentBranch ?? "production").trim();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(parentBranch)) throw new Error("parentBranch is invalid");
  const branchName = previewBranchName(input.prNumber, input.slug);
  const expiresAt = new Date((input.now ?? new Date()).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return {
    branchName,
    parentBranch,
    schemaOnly: true,
    expiresAt,
    createCommand: `neon branches create --project-id <project-id> --name ${branchName} --parent ${parentBranch} --schema-only --expires-at ${expiresAt}`,
    migrateCommand: `DATABASE_URL="$(neon connection-string ${branchName} --role-name neondb_owner --database-name neondb)" corepack pnpm tsx <owner migration runner>`,
    envKeys: ["DATABASE_URL", "DATABASE_URL_UNPOOLED"],
    cleanupCommand: `neon branches delete --project-id <project-id> ${branchName}`,
  };
}

export type PreviewIsolation = {
  previewHost: string;
  previewDatabase: string;
  productionHost: string;
  productionDatabase: string;
};

/**
 * Fails closed unless the preview URL is a different Neon endpoint/database
 * from production. URLs are only parsed for host/database and are never
 * returned or logged.
 */
export function assertPreviewIsolation(previewUrl: string, productionUrl: string): PreviewIsolation {
  const parse = (url: string, label: string): { host: string; database: string } => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`${label} is not a valid database URL`);
    }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error(`${label} must be a PostgreSQL URL`);
    const database = parsed.pathname.replace(/^\//, "");
    if (!parsed.hostname || !database) throw new Error(`${label} must include a host and database name`);
    return { host: parsed.hostname.toLowerCase(), database };
  };
  const preview = parse(previewUrl, "preview DATABASE_URL");
  const production = parse(productionUrl, "production DATABASE_URL");
  if (preview.host === production.host) throw new Error("preview DATABASE_URL points at the production endpoint");
  if (preview.database !== production.database) {
    // A different database can still be the same tenant; require a different branch host above.
    throw new Error("preview and production database names must match (`neondb`) on different branch endpoints");
  }
  return {
    previewHost: preview.host,
    previewDatabase: preview.database,
    productionHost: production.host,
    productionDatabase: production.database,
  };
}

/** Read-only sanity check used by the CLI; no writes and no content. */
export async function readPreviewJournalMin(pool: Pick<Pool, "query">): Promise<number | null> {
  const row = (await pool.query<{ n: number | null }>("SELECT max(ordinal)::int AS n FROM neon_migrations.journal")).rows[0];
  return typeof row?.n === "number" ? row.n : null;
}
