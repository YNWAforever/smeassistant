import Link from "next/link"
import { ArrowRight, BadgeCheck, CheckCircle2, CircleDashed, CreditCard, ShieldAlert, ShieldCheck } from "lucide-react"

import { PageIntro, SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BillingActions } from "@/components/workspace/billing-actions"
import type { PrototypeLocale } from "@/lib/copy"
import type { BillingModel } from "@/lib/workspace/billing"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { formatDateTime } from "@/lib/workspace/format"

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
}

function formatPrice(price: BillingModel["marketPrice"]): string {
  const prefix = price.currency === "TWD" ? "NT$" : price.currency === "HKD" ? "HK$" : `${price.currency} `
  return `${prefix}${price.amount.toLocaleString("en-US")}`
}

export function BillingView({ locale, workspaceId, role, timezone, model, checkout }: BillingViewProps) {
  const isChinese = locale !== "en"
  const paid = model.tier === "paid"
  const { usage } = model
  const unlimited = usage.allowance === null
  const remaining = unlimited ? null : Math.max(0, (usage.allowance ?? 0) - usage.approvedDeliveries)
  const progress = unlimited ? 0 : Math.min(100, Math.round((usage.approvedDeliveries / Math.max(1, usage.allowance ?? 1)) * 100))
  const planName = paid ? (isChinese ? "增長工作台" : "Growth Workspace") : (isChinese ? "免費方案" : "Free plan")
  const allowanceLabel = unlimited ? (isChinese ? "不限" : "unlimited") : String(usage.allowance)

  return (
    <div className="settings-page billing-page">
      <PageIntro eyebrow={isChinese ? "方案、核准後交付及付款週期" : "Plan, approved deliveries and payment lifecycle"} title={isChinese ? "方案與帳單" : "Plan & billing"} description={isChinese ? "單一、可核對的用量口徑：生成、修改、拒絕及失敗不扣除；首次核准後匯出或發佈才計 1 次。" : "One auditable metric: generation, revision, rejection and failure are free; first approved export or publish counts as one delivery."} />
      {role !== "owner" && <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? "沒有帳單管理權限" : "No billing authority"}</strong><span>{isChinese ? "經理及檢視者可查看方案與營運限制，但不能更改付款或成員權益。" : "Managers and viewers may inspect plan limits but cannot change payment or entitlements."}</span></div><Badge variant="outline">{isChinese ? "權限不足" : "Permission denied"}</Badge></div>}
      {checkout === "success" && <div className="context-banner" role="status"><CheckCircle2 /><div><strong>{isChinese ? "Stripe 已收到你的訂閱" : "Stripe received your subscription"}</strong><span>{isChinese ? "方案會在 Stripe 確認付款後自動更新；如未即時顯示，請稍後重新整理。" : "The plan updates automatically once Stripe confirms payment; refresh shortly if it has not changed yet."}</span></div></div>}
      {checkout === "cancelled" && <div className="context-banner" role="status"><CircleDashed /><div><strong>{isChinese ? "已取消結帳" : "Checkout cancelled"}</strong><span>{isChinese ? "沒有任何費用；你可隨時再次訂閱。" : "Nothing was charged; you can subscribe again at any time."}</span></div></div>}
      <section className="billing-overview">
        <SectionCard className="plan-card">
          <div className="plan-card-head"><div><Badge>{planName}</Badge><h2>{formatPrice(model.marketPrice)} <span>{isChinese ? "／月" : "/ month"}</span></h2><p>{paid ? (isChinese ? "1 個工作台 · 每月不限核准後交付 · 每月重新掃描" : "1 workspace · unlimited approved deliveries/month · monthly rescans") : (isChinese ? `目前為免費方案 · 每月 ${allowanceLabel} 次核准後交付 · 訂閱後不限` : `Currently free · ${allowanceLabel} approved deliveries/month · unlimited once subscribed`)}</p></div><Badge variant="outline">{paid ? (isChinese ? "訂閱生效中" : "Subscription active") : (isChinese ? "尚未訂閱" : "Not subscribed")}</Badge></div>
          <div className="usage-large"><div><span>{isChinese ? "本月核准後交付" : "Approved deliveries this month"}</span><strong>{usage.approvedDeliveries} / {allowanceLabel}</strong></div><Progress value={progress} /><small>{unlimited ? (isChinese ? `${usage.period} · 不設上限` : `${usage.period} · no cap`) : (isChinese ? `尚餘 ${remaining} 次 · ${usage.period} 期間` : `${remaining} remain · period ${usage.period}`)}</small></div>
          <div className="limitation-note"><CircleDashed /> {isChinese ? "生成、修改及拒絕不扣除額度；只有首次核准後匯出或複製才計 1 次。" : "Generation, revisions and rejection use no allowance; only the first approved export or copy counts as one."}</div>
          {role === "owner" ? <BillingActions locale={locale} workspaceId={workspaceId} paid={paid && model.stripeCustomer} /> : <div className="plan-actions"><Button disabled>{paid ? (isChinese ? "管理帳單" : "Manage billing") : (isChinese ? "透過 Stripe 訂閱" : "Subscribe via Stripe")}</Button><Button variant="outline" disabled>{isChinese ? "加購用量 · 規劃中" : "Top-up · Planned"}</Button></div>}
        </SectionCard>
        <SectionCard className="payment-retry-card">
          <div className="payment-retry-icon"><CreditCard /></div>
          <Badge variant="outline">{isChinese ? "付款週期" : "Payment lifecycle"}</Badge>
          <h2>{paid ? (isChinese ? "訂閱由 Stripe 管理" : "Your subscription is managed by Stripe") : (isChinese ? "訂閱後即時解鎖增長工作台" : "Subscribe to unlock the Growth Workspace")}</h2>
          <p>{isChinese ? "寬限期內工作台仍可使用；權益以目前訂閱狀態核對，不依賴 webhook 到達次序。" : "The workspace remains available during grace; entitlement is reconciled from subscription state, not webhook order."}</p>
          <p className="limitation-note"><ShieldCheck /> {isChinese ? "方案變更只會經 Stripe webhook 或 Fimmick 職員授權寫入；此頁面不會自行更改權益。" : "Tier changes arrive only through the Stripe webhook or a Fimmick staff grant; this page never edits entitlements itself."}</p>
        </SectionCard>
      </section>
      <div className="billing-detail-grid">
        <SectionCard>
          <p className="eyebrow">{isChinese ? "不可變更的方案紀錄" : "Immutable tier ledger"}</p>
          <h2>{isChinese ? "方案變更紀錄" : "Tier history"}</h2>
          {model.tierEvents.length === 0 ? (
            <p>{isChinese ? "尚未有方案變更。" : "No tier changes recorded yet."}</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>{isChinese ? "日期" : "Date"}</TableHead><TableHead>{isChinese ? "方案" : "Tier"}</TableHead><TableHead>{isChinese ? "來源" : "Source"}</TableHead></TableRow></TableHeader>
              <TableBody>
                {model.tierEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDateTime(event.createdAt, locale, timezone)}</TableCell>
                    <TableCell><Badge variant={event.tier === "paid" ? "default" : "outline"}>{event.tier === "paid" ? (isChinese ? "增長工作台" : "Growth Workspace") : (isChinese ? "免費方案" : "Free plan")}</Badge></TableCell>
                    <TableCell>{event.source === "stripe_webhook" ? (isChinese ? "Stripe 訂閱狀態" : "Stripe subscription") : event.source === "staff_grant" ? (isChinese ? "Fimmick 職員授權" : "Fimmick staff grant") : event.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="limitation-note"><BadgeCheck /> {isChinese ? "失敗執行、重新生成或單純核准均為 0；只有首次成功交付扣除 1。" : "Failed runs, regeneration and approval alone are zero; only first successful delivery counts one."}</p>
        </SectionCard>
        <SectionCard>
          <p className="eyebrow">{isChinese ? "商業服務邊界" : "Commercial boundary"}</p>
          <h2>{isChinese ? "專人能見度服務不是此自助方案" : "Managed Visibility is separate"}</h2>
          <p>{isChinese ? "顧問策略、落地執行及宣傳營運會另行界定範圍及報價；同樣保留工作台證據及店主審批。" : "Consultant strategy, implementation and campaign operations are separately scoped and invoiced, while retaining evidence and owner approval."}</p>
          <Button asChild variant="outline"><Link href={`/${locale}/pricing`}>{isChinese ? "比較所有方案" : "Compare all plans"}<ArrowRight /></Link></Button>
        </SectionCard>
      </div>
    </div>
  )
}
