import Link from "next/link"
import { ArrowRight, CheckCircle2, CircleDashed, CreditCard, ShieldCheck } from "lucide-react"

import { PageIntro, SectionCard } from "@/components/product-ui"
import { RoleNotice } from "@/components/states/role-notice"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BillingActions } from "@/components/workspace/billing-actions"
import { t } from "@/lib/i18n"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { BillingModel } from "@/lib/workspace/billing"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { formatDateTime } from "@/lib/workspace/format"
import { fill } from "@/lib/copy-ui"

/**
 * `/settings/billing` bound to lib/workspace/billing.ts (CLAUDE.md §3.10,
 * Phase 4 item 5). Layout, classes and copy come from the prototype's
 * BillingPage (components/workspace-operations.tsx); the "preview billing
 * role" select is gone -- the banner reflects the caller's real server-side
 * role, and only owners get the Stripe buttons (§3.9).
 */
export interface BillingViewProps {
  locale: PrototypeLocale
  workspaceId: string
  role: WorkspaceRole
  timezone: string
  model: BillingModel
  checkout?: string
  /** Whether billing (Stripe checkout/portal) is currently open (lib/commercial/availability.ts). */
  billingOpen: boolean
  /** The workspace market's first configured contact channel, or null when none is set. */
  contactHref: string | null
}

function formatPrice(price: BillingModel["marketPrice"]): string {
  const prefix = price.currency === "TWD" ? "NT$" : price.currency === "HKD" ? "HK$" : `${price.currency} `
  return `${prefix}${price.amount.toLocaleString("en-US")}`
}

export function BillingView({ locale, workspaceId, role, timezone, model, checkout, billingOpen, contactHref }: BillingViewProps) {
  const pc = copy[locale].workspaceBusiness.billing
  const paid = model.tier === "paid"
  const { usage } = model
  const unlimited = usage.allowance === null
  const remaining = unlimited ? null : Math.max(0, (usage.allowance ?? 0) - usage.approvedDeliveries)
  const progress = unlimited ? 0 : Math.min(100, Math.round((usage.approvedDeliveries / Math.max(1, usage.allowance ?? 1)) * 100))
  const planName = paid ? pc.growthWorkspace : pc.freePlan
  const allowanceLabel = unlimited ? pc.unlimited : String(usage.allowance)
  // Before billing opens, a configured contact channel adds a contact button
  // under this label; without one there is no empty href (Review Focus 5).
  const notOpenLabel = t(locale, "commercial.notOpen")

  return (
    <div className="settings-page billing-page">
      <PageIntro eyebrow={pc.planApprovedDeliveriesAnd} title={pc.planBilling} description={pc.oneAuditableMetricGeneration} />
      {role !== "owner" && <RoleNotice kind="billing" locale={locale} />}
      {checkout === "success" && <div className="context-banner" role="status"><CheckCircle2 /><div><strong>{pc.stripeReceivedYourSubscription}</strong><span>{pc.thePlanUpdatesAutomatically}</span></div></div>}
      {checkout === "cancelled" && <div className="context-banner" role="status"><CircleDashed /><div><strong>{pc.checkoutCancelled}</strong><span>{pc.nothingWasChargedYou}</span></div></div>}
      <section className="billing-overview">
        <SectionCard className="plan-card">
          <div className="plan-card-head"><div><Badge>{planName}</Badge><h2>{formatPrice({...model.marketPrice,amount:paid?model.marketPrice.amount:0})} <span>{pc.month}</span></h2><p>{paid ? pc.growthPlanSummary : billingOpen ? (fill(pc.currentlyFreeApprovedDeliveries, { allowanceLabel })) : (fill(pc.currentlyFreeAllowance, { allowanceLabel }))}</p></div><Badge variant="outline">{paid ? pc.subscriptionActive : pc.notSubscribed}</Badge></div>
          {!paid && <p className="upgrade-price">{pc.upgradeToGrowthWorkspace}: {formatPrice(model.marketPrice)} {pc.month}</p>}
          <div className="usage-large"><div><span>{pc.approvedDeliveriesThisMonth}</span><strong>{usage.approvedDeliveries} / {allowanceLabel}</strong></div><Progress value={progress} aria-label={pc.approvedDeliveriesUsedThis} /><small>{unlimited ? (fill(pc.noCap, { period: usage.period })) : (fill(pc.remainPeriod, { remaining: String(remaining), period: usage.period }))}</small></div>
          {/* The usage rule is the page's lead line; the "not open yet" note and its contact button live in the card beside this one. */}
          {!billingOpen ? null : role === "owner" ? (
            <BillingActions locale={locale} workspaceId={workspaceId} paid={paid && model.stripeCustomer} />
          ) : (
            <div className="plan-actions"><Button disabled>{paid ? pc.manageBilling : pc.subscribeViaStripe}</Button><Button variant="outline" disabled>{pc.topUpPlanned}</Button></div>
          )}
        </SectionCard>
        <SectionCard className="payment-retry-card">
          <div className="payment-retry-icon"><CreditCard /></div>
          <Badge variant="outline">{pc.paymentLifecycle}</Badge>
          <h2>{paid ? pc.yourSubscriptionIsManaged : !billingOpen ? notOpenLabel : pc.subscribeToUnlockThe}</h2>
          {!paid && !billingOpen && contactHref && <Button asChild><a href={contactHref}>{t(locale, "commercial.contact")}<ArrowRight /></a></Button>}
          <p>{pc.theWorkspaceRemainsAvailable}</p>
          <p className="limitation-note"><ShieldCheck /> {pc.tierChangesArriveOnly}</p>
        </SectionCard>
      </section>
      <div className="billing-detail-grid">
        <SectionCard>
          <p className="eyebrow">{pc.immutableTierLedger}</p>
          <h2>{pc.tierHistory}</h2>
          {model.tierEvents.length === 0 ? (
            <p>{pc.noTierChangesRecorded}</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>{pc.date}</TableHead><TableHead>{pc.tier}</TableHead><TableHead>{copy[locale].workspace.verification.source}</TableHead></TableRow></TableHeader>
              <TableBody>
                {model.tierEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDateTime(event.createdAt, locale, timezone)}</TableCell>
                    <TableCell><Badge variant={event.tier === "paid" ? "default" : "outline"}>{event.tier === "paid" ? pc.growthWorkspace : pc.freePlan}</Badge></TableCell>
                    <TableCell>{event.source === "stripe_webhook" ? pc.stripeSubscription : event.source === "staff_grant" ? pc.fimmickStaffGrant : event.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
        <SectionCard>
          <p className="eyebrow">{pc.commercialBoundary}</p>
          <h2>{pc.managedVisibilityIsSeparate}</h2>
          <p>{pc.consultantStrategyImplementationAnd}</p>
          <Button asChild variant="outline"><Link href={`/${locale}/pricing`}>{pc.compareAllPlans}<ArrowRight /></Link></Button>
        </SectionCard>
      </div>
    </div>
  )
}
