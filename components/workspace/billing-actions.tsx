"use client"

import { useState } from "react"
import { CreditCard } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { createOwnerBillingLink } from "@/lib/owner/billing-client"

/**
 * The one interactive piece of the billing page: a form whose submit asks
 * the server for a Stripe Checkout (lite) or Billing Portal (paid) URL and
 * navigates there. Rendered only for owners -- the routes enforce the same
 * rule server-side; this is display convenience, not the boundary.
 */
export function BillingActions({ locale, workspaceId, paid }: { locale: PrototypeLocale; workspaceId: string; paid: boolean }) {
  const pc = copy[locale].workspaceBusiness.billing
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const result = await createOwnerBillingLink(paid, workspaceId, locale)
    setPending(false)
    if (!result.ok) {
      const message =
        result.error === "already_paid" ? pc.thisWorkspaceIsAlready
        : result.error === "no_subscription" ? pc.noSubscriptionYetSubscribe
        : pc.thePaymentServiceIs
      toast.error(message)
      return
    }
    window.location.assign(result.url)
  }

  return (
    <form className="plan-actions" onSubmit={onSubmit}>
      <Button type="submit" disabled={pending}><CreditCard /> {paid ? pc.manageBilling : pc.subscribeViaStripe}</Button>
      <Button type="button" variant="outline" disabled>{pc.topUpPlanned}</Button>
    </form>
  )
}
