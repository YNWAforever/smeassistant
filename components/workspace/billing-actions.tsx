"use client"

import { useState } from "react"
import { CreditCard } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { createOwnerBillingLink } from "@/lib/owner/billing-client"

/**
 * The one interactive piece of the billing page: a form whose submit asks
 * the server for a Stripe Checkout (lite) or Billing Portal (paid) URL and
 * navigates there. Rendered only for owners -- the routes enforce the same
 * rule server-side; this is display convenience, not the boundary.
 */
export function BillingActions({ locale, workspaceId, paid }: { locale: PrototypeLocale; workspaceId: string; paid: boolean }) {
  const isChinese = locale !== "en"
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const result = await createOwnerBillingLink(paid, workspaceId, locale)
    setPending(false)
    if (!result.ok) {
      const message =
        result.error === "already_paid" ? (isChinese ? "此工作台已是付費方案。" : "This workspace is already on the paid plan.")
        : result.error === "no_subscription" ? (isChinese ? "尚未有訂閱；請先透過 Stripe 訂閱。" : "No subscription yet; subscribe via Stripe first.")
        : (isChinese ? "暫時未能連接付款服務，請稍後再試。" : "The payment service is unavailable right now; please try again later.")
      toast.error(message)
      return
    }
    window.location.assign(result.url)
  }

  return (
    <form className="plan-actions" onSubmit={onSubmit}>
      <Button type="submit" disabled={pending}><CreditCard /> {paid ? (isChinese ? "管理帳單" : "Manage billing") : (isChinese ? "透過 Stripe 訂閱" : "Subscribe via Stripe")}</Button>
      <Button type="button" variant="outline" disabled>{isChinese ? "加購用量 · 規劃中" : "Top-up · Planned"}</Button>
    </form>
  )
}
