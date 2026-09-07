import type { Pool } from "pg";

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

/** Unique slug candidates; the persisted unique indexes arbitrate write races. */
export async function uniqueWorkspaceSlug(db: Pick<Pool,"query">, base:string):Promise<string> {
 try {
  const result=await db.query<{slug:string|null}>("SELECT slug FROM workspaces WHERE slug LIKE $1",[likePrefix(base)]);
  return firstFreeSlug(base,result.rows.map(row=>row.slug).filter((slug):slug is string=>slug!==null));
 } catch {throw new Error("workspace slug lookup failed");}
}

/** Location slugs are unique only within their owning workspace. */
export async function uniqueLocationSlug(db:Pick<Pool,"query">,workspaceId:string,base:string):Promise<string> {
 try {
  const result=await db.query<{slug:string|null}>("SELECT slug FROM locations WHERE workspace_id=$1 AND slug LIKE $2",[workspaceId,likePrefix(base)]);
  return firstFreeSlug(base,result.rows.map(row=>row.slug).filter((slug):slug is string=>slug!==null));
 } catch {throw new Error("location slug lookup failed");}
}
