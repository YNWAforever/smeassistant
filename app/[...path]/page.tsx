import { SmePrototype } from "@/components/sme-prototype"
import { chatGPTSignInPath, requireChatGPTUser } from "@/app/chatgpt-auth"
import { notFound } from "next/navigation"
import { supportedLocales } from "@/lib/copy"

export const dynamic = "force-dynamic"

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function queryString(query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
    else if (value) params.set(key, value)
  })
  const result = params.toString()
  return result ? `?${result}` : ""
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
  const locale = path[0] ?? "zh-HK"
  const route = path.slice(1)
  const isOwnerRoute = route[0] === "owner"
  const isSignInRoute = isOwnerRoute && route[1] === "sign-in"
  const currentPath = `/${path.join("/")}${queryString(query)}`

  if (isOwnerRoute && !isSignInRoute) await requireChatGPTUser(currentPath)

  const onboardingParams = new URLSearchParams()
  const claim = first(query.claim)
  const plan = first(query.plan)
  const location = first(query.location)
  if (claim) onboardingParams.set("claim", claim)
  if (plan) onboardingParams.set("plan", plan)
  if (location) onboardingParams.set("location", location)
  const onboardingQuery = onboardingParams.toString()
  const signInHref = isSignInRoute
    ? chatGPTSignInPath(`/${locale}/owner/onboarding${onboardingQuery ? `?${onboardingQuery}` : ""}`)
    : undefined

  return (
    <SmePrototype
      path={path}
      searchBusiness={first(query.business)}
      searchMarket={first(query.market)}
      searchRole={first(query.role)}
      searchClaim={claim}
      searchPlan={plan}
      searchLocation={location}
      signInHref={signInHref}
    />
  )
}
