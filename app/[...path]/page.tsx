import { SmePrototype } from "@/components/sme-prototype"
import { notFound } from "next/navigation"
import { supportedLocales } from "@/lib/copy"

export const dynamic = "force-dynamic"

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function PrototypeRoute({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { path } = await params
  if (!path[0] || !supportedLocales.includes(path[0] as (typeof supportedLocales)[number])) notFound()
  const query = await searchParams

  return (
    <SmePrototype
      path={path}
      searchBusiness={first(query.business)}
      searchMarket={first(query.market)}
      searchRole={first(query.role)}
      searchClaim={first(query.claim)}
      searchPlan={first(query.plan)}
      searchLocation={first(query.location)}
    />
  )
}
