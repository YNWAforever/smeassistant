import { notFound } from "next/navigation"

import { SmePrototype } from "@/components/sme-prototype"
import { isLocale } from "@/lib/locale"

/**
 * Phase 2 bridge, and nothing else.
 *
 * Every public segment has a real route under `app/[locale]/**`, which always
 * out-ranks this catch-all, and so do the owner entry pages since Phase 2:
 * `/{locale}/owner/sign-in`, `/{locale}/owner/onboarding`,
 * `/{locale}/owner/select-workspace` and the workspace home
 * `/{locale}/owner/[workspaceSlug]`. Only the not-yet-ported workspace
 * sub-pages (`/{locale}/owner/<slug>/settings/{brand,team}`) still render
 * the prototype dispatcher against `lib/demo-data.ts`, until Phase 6 wires
 * them; the Phase 3 and Phase 4 pages (`create`, `assets`, `settings/billing`)
 * are real routes and are refused here too. Anything else 404s rather than
 * silently falling back to a demo page (guardrail 12).
 */
export const dynamic = "force-dynamic"

/** Segments that have real routes now; guarded here too so a routing change can never resurface the prototype versions. */
const REAL_OWNER_ROUTES = new Set(["sign-in", "onboarding", "select-workspace"])
/** Workspace sub-pages wired to real data in Phases 3-4; only settings/{brand,team} still come from the prototype until Phase 6. */
const REAL_WORKSPACE_PAGES = new Set(["actions", "insights", "activity", "calendar", "more", "create", "assets"])
const REAL_SETTINGS_PAGES = new Set(["integrations", "notifications", "billing"])

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function OwnerPrototypeBridge({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { path } = await params
  if (!isLocale(path[0]) || path[1] !== "owner" || path.length < 4) notFound()
  if (REAL_OWNER_ROUTES.has(path[2])) notFound()
  if (REAL_WORKSPACE_PAGES.has(path[3])) notFound()
  if (path[3] === "settings" && REAL_SETTINGS_PAGES.has(path[4] ?? "")) notFound()
  const query = await searchParams

  return (
    <SmePrototype
      path={path}
      searchRole={first(query.role)}
      searchLocation={first(query.location)}
    />
  )
}
