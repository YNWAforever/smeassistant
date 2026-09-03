import { notFound } from "next/navigation"

import { SmePrototype } from "@/components/sme-prototype"
import { isLocale } from "@/lib/locale"

/**
 * Phase 2 bridge, and nothing else.
 *
 * Every public segment now has a real route under `app/[locale]/**`, which
 * always out-ranks this catch-all. The owner workspace has not been ported yet,
 * so `/{locale}/owner/*` keeps rendering the prototype dispatcher against
 * `lib/demo-data.ts` until Phase 2 replaces it. Anything else 404s rather than
 * silently falling back to a demo page (guardrail 12).
 */
export const dynamic = "force-dynamic"

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
  if (!isLocale(path[0]) || path[1] !== "owner" || path.length < 3) notFound()
  const query = await searchParams

  return (
    <SmePrototype
      path={path}
      searchRole={first(query.role)}
      searchClaim={first(query.claim)}
      searchPlan={first(query.plan)}
      searchLocation={first(query.location)}
    />
  )
}
