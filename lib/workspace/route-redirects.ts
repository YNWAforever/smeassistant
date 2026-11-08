import { offerPromotionsEnabled } from "@/lib/workspace/offers-flag"

/**
 * Phase 4 workspace routes (docs/ux target IA §3). Old workspace pages move
 * under the five destinations; their URLs answer a permanent redirect that
 * keeps every query parameter (?location=, Stripe's ?checkout=, OAuth's
 * ?google=), so bookmarks, emailed links and the API routes' return URLs keep
 * working unchanged.
 */
type Move = { to: string; add?: Record<string, string>; when?: (env: Record<string, string | undefined>) => boolean }

const MOVES: Record<string, Move> = {
  create: { to: "actions/new" },
  calendar: { to: "actions", add: { view: "due" } },
  assets: { to: "business/assets" },
  "settings/brand": { to: "business/profile" },
  "settings/integrations": { to: "business/integrations" },
  "settings/billing": { to: "settings/plan" },
  activity: { to: "settings/activity" },
  more: { to: "settings" },
  // While the flag is off /offers stays a 404, exactly as before.
  offers: { to: "actions/new", add: { mode: "offer" }, when: (env) => offerPromotionsEnabled(env) },
}

const LOCALES = new Set(["en", "zh-HK", "zh-TW"])

/** `/{locale}/owner/{ws}/{old}` → the new path and query, or null. */
export function resolveWorkspaceRedirect(
  pathname: string,
  search: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const segments = pathname.split("/").filter(Boolean)
  const [locale, owner, workspace, ...rest] = segments
  if (!locale || !LOCALES.has(locale) || owner !== "owner" || !workspace || rest.length === 0) return null
  if (workspace === "select-workspace" || workspace === "onboarding" || workspace === "sign-in") return null
  const move = MOVES[rest.join("/")]
  if (!move || (move.when && !move.when(env))) return null
  const params = new URLSearchParams(search)
  for (const [key, value] of Object.entries(move.add ?? {})) if (!params.has(key)) params.set(key, value)
  const query = params.toString()
  return `/${locale}/owner/${workspace}/${move.to}${query ? `?${query}` : ""}`
}
