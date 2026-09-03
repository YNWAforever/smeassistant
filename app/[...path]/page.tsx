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
 * sub-pages (`/{locale}/owner/<slug>/actions`, `/insights`, …) still render
 * the prototype dispatcher against `lib/demo-data.ts`, until Phases 3–6 wire
 * each one. Anything else 404s rather than silently falling back to a demo
 * page (guardrail 12).
 */
export const dynamic = "force-dynamic"

/** Segments that have real routes now; guarded here too so a routing change can never resurface the prototype versions. */
const REAL_OWNER_ROUTES = new Set(["sign-in", "onboarding", "select-workspace"])

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
  const query = await searchParams

  return (
    <SmePrototype
      path={path}
      searchRole={first(query.role)}
      searchLocation={first(query.location)}
    />
  )
}
