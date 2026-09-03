import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * URL slugs for workspaces and locations (CLAUDE.md §3.1: every owner route is
 * addressed by `workspaceSlug` / `locationSlug`, never by uuid).
 *
 * `slugify` is pure. Uniqueness is decided against the database by the two
 * async helpers, which take the client as a parameter — matching
 * callback-queries.ts — so the callers (createWorkspaceWithOwner, the claim
 * completion RPC caller, the seed script) share one rule and tests can pass a
 * stub.
 */

const MAX_SLUG_LENGTH = 48;
const FALLBACK_SLUG = "workspace";

/**
 * kebab-case ASCII. NFKD strips accents (é → e); anything left outside
 * `[a-z0-9]` collapses to a single hyphen, so a purely CJK name (錦汶館)
 * collapses to nothing and falls back to "workspace". Capped at 48 chars so
 * a long business name still leaves room for the "-<n>" collision suffix
 * inside a sane URL.
 */
export function slugify(input: string): string {
  const ascii = input
    .normalize("NFKD")
    // NFKD splits "é" into "e" + a combining mark; drop the marks so the base
    // letter survives instead of turning into a hyphen.
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return ascii.length > 0 ? ascii : FALLBACK_SLUG;
}

/**
 * Pick the first free slug among `base`, `base-2`, `base-3`, … given the slugs
 * already taken. Exported for tests and for the two database-backed helpers
 * below; `-1` is never emitted because the bare base already means "first".
 */
export function firstFreeSlug(base: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  const suffixRe = new RegExp(`^${escapeRegExp(base)}(?:-(\\d+))?$`);
  for (const slug of taken) {
    if (suffixRe.test(slug)) used.add(slug);
  }
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escape `%`/`_`/`\` so a slug containing them cannot widen the LIKE pattern. */
function likePrefix(base: string): string {
  return `${base.replace(/[\\%_]/g, "\\$&")}%`;
}

async function existingSlugs(
  query: PromiseLike<{ data: Array<{ slug: string | null }> | null; error: { message: string } | null }>,
  label: string,
): Promise<string[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label} slug lookup failed`);
  return (data ?? []).map((row) => row.slug).filter((slug): slug is string => typeof slug === "string");
}

/**
 * Unique against `workspaces.slug`. The select is a prefix match (`base%`) so
 * one round-trip returns every candidate the suffix rule could collide with;
 * unrelated prefixes (`base-shop`) are filtered out by firstFreeSlug. The
 * partial unique index on workspaces.slug is the real guarantee — a lost race
 * surfaces as an insert error for the caller to retry.
 */
export async function uniqueWorkspaceSlug(db: SupabaseClient, base: string): Promise<string> {
  const taken = await existingSlugs(
    db.from("workspaces").select("slug").like("slug", likePrefix(base)),
    "workspace",
  );
  return firstFreeSlug(base, taken);
}

/** Unique per workspace against `locations.slug` (unique on (workspace_id, slug)). */
export async function uniqueLocationSlug(
  db: SupabaseClient,
  workspaceId: string,
  base: string,
): Promise<string> {
  const taken = await existingSlugs(
    db.from("locations").select("slug").eq("workspace_id", workspaceId).like("slug", likePrefix(base)),
    "location",
  );
  return firstFreeSlug(base, taken);
}
