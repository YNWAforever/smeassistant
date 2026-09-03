import Link from "next/link"
import { ArrowRight, SearchX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { normaliseLocale } from "@/lib/copy"
import { resolveMarketParam } from "@/lib/funnel/pricing"
import { sampleReportProps } from "@/lib/funnel/sample-report"
import { PublicPageFrame, WorkspacePageFrame } from "@/components/product-ui"
import {
  LandingPage,
  MethodologyPage,
  OnboardingPage,
  PricingPage,
  ReportPage,
  ScanPage,
  ScanningPage,
  SelectWorkspacePage,
  SignInPage,
  TrustPage,
  UnlockPage,
} from "@/components/public-pages"
import { OwnerHomePage } from "@/components/workspace-home"
import { ActionDetailPage, ActionsPage } from "@/components/workspace-actions"
import { PublicDemoWorkspacePage } from "@/components/public-demo-workspace"
import {
  ActivityPage,
  AssetsPage,
  BillingPage,
  BrandSettingsPage,
  CalendarPage,
  CreatePage,
  InsightsPage,
  IntegrationsPage,
  MorePage,
  NotificationsPage,
  TeamPage,
} from "@/components/workspace-operations"

type PrototypeProps = {
  path: string[]
  searchBusiness?: string
  searchMarket?: string
  searchRole?: string
  searchClaim?: string
  searchPlan?: string
  searchLocation?: string
  signInHref?: string
}

function NotAvailable({ locale }: { locale: ReturnType<typeof normaliseLocale> }) {
  const isChinese = locale !== "en"
  return (
    <PublicPageFrame locale={locale}>
      <main className="not-found-page">
        <SearchX />
        <h1>{isChinese ? "找不到這個示範頁面" : "This prototype route is not available"}</h1>
        <p>{isChinese ? "連結可能已失效，或不屬於目前可審閱的 SME Scanner 體驗。" : "The link may be stale or outside the reviewable SME Scanner experience."}</p>
        <div>
          <Button asChild><Link href={`/${locale}`}>{isChinese ? "返回 SME Scanner" : "Open SME Scanner"} <ArrowRight /></Link></Button>
          <Button asChild variant="outline"><Link href={`/${locale}/owner/sign-in`}>{isChinese ? "店主安全登入" : "Owner sign in"}</Link></Button>
        </div>
      </main>
    </PublicPageFrame>
  )
}

export function SmePrototype({ path, searchBusiness, searchMarket, searchRole, searchClaim, searchPlan, searchLocation, signInHref }: PrototypeProps) {
  const locale = normaliseLocale(path[0])
  const route = path.slice(1)

  const market = resolveMarketParam(searchMarket, locale)

  if (route.length === 0) return <LandingPage locale={locale} market={market} />
  if ((route[0] === "scan" || route[0] === "scanner") && route.length === 1) return <ScanPage locale={locale} initialMarket={market} initialBusiness={searchBusiness} />
  if (route[0] === "scanning" && route.length === 2) return <ScanningPage locale={locale} jobId={route[1]} />
  if (route[0] === "sample-report" && route.length === 1) return <ReportPage {...sampleReportProps(locale)} />
  if (route[0] === "demo-workspace" && route.length === 1) return <PublicDemoWorkspacePage locale={locale} />
  if (route[0] === "unlock" && route.length === 2) return <UnlockPage locale={locale} slug={route[1]} market={market} />
  if (route[0] === "pricing" && route.length === 1) return <PricingPage locale={locale} market={market} />
  if (route[0] === "methodology" && route.length === 1) return <MethodologyPage locale={locale} />
  if (route[0] === "trust" && route.length === 1) return <TrustPage locale={locale} />

  if (route[0] === "owner" && route[1] === "sign-in" && route.length === 2) return <SignInPage locale={locale} signInHref={signInHref} plan={searchPlan} />
  if (route[0] === "owner" && route[1] === "onboarding" && route.length === 2) return <OnboardingPage locale={locale} claim={searchClaim} plan={searchPlan} initialLocation={searchLocation} />
  if (route[0] === "owner" && route[1] === "select-workspace" && route.length === 2) return <SelectWorkspacePage locale={locale} />

  if (route[0] === "owner" && route[1] === "kam-man-house") {
    const destination = route[2]
    const nested = route[3]
    let page = destination ? null : <OwnerHomePage locale={locale} initialLocation={searchLocation} />
    if (destination === "actions" && ["review-response", "social-post"].includes(nested ?? "")) page = <ActionDetailPage locale={locale} actionId={nested ?? "review-response"} initialRole={searchRole} initialLocation={searchLocation} />
    else if (destination === "actions" && nested === "google-reconnect") page = <IntegrationsPage locale={locale} />
    else if (destination === "actions" && nested) page = null
    else if (destination === "actions") page = <ActionsPage locale={locale} initialLocation={searchLocation} />
    else if (destination === "create") page = <CreatePage locale={locale} />
    else if (destination === "insights") page = <InsightsPage locale={locale} initialLocation={searchLocation} />
    else if (destination === "assets") page = <AssetsPage locale={locale} />
    else if (destination === "calendar") page = <CalendarPage locale={locale} />
    else if (destination === "activity") page = <ActivityPage locale={locale} />
    else if (destination === "more") page = <MorePage locale={locale} />
    else if (destination === "settings" && nested === "brand") page = <BrandSettingsPage locale={locale} />
    else if (destination === "settings" && nested === "integrations") page = <IntegrationsPage locale={locale} />
    else if (destination === "settings" && nested === "team") page = <TeamPage locale={locale} />
    else if (destination === "settings" && nested === "billing") page = <BillingPage locale={locale} />
    else if (destination === "settings" && nested === "notifications") page = <NotificationsPage locale={locale} />
    if (page && route.length <= 4) return <WorkspacePageFrame locale={locale} demo>{page}</WorkspacePageFrame>
  }

  return <NotAvailable locale={locale} />
}
