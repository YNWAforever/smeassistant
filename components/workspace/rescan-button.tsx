"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { rescanLocation, type ClientResult } from "@/lib/workspace/client"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"

/**
 * The prototype's "Rescan" outline button, bound to the Phase 6 rescan route
 * (CLAUDE.md §3.2.3, CONTRACT-6). Hidden for viewers; disabled with the tier
 * copy and a billing link on lite workspaces; needs one concrete location
 * (an "all locations" scope has nothing to rescan). On success the browser
 * moves to the scanning page for the new job. The routes enforce the same
 * rules server-side; this is display convenience, not the boundary.
 */
export function RescanButton({ locale, workspaceId, workspaceSlug, locationId, tier, role, consentPolicyVersion }: {
  locale: PrototypeLocale
  workspaceId: string
  workspaceSlug: string
  locationId: string | null
  tier: "lite" | "paid"
  role: WorkspaceRole
  /**
   * Resolved on the server and passed down. It must NOT be computed here:
   * `currentScanConsentPolicyVersion` reads REPORT_CONSENT_POLICY_VERSION,
   * which is not NEXT_PUBLIC_, so in the browser it silently returns the
   * default -- and any deployment carrying an override would then 409 on every
   * rescan with no way out.
   */
  consentPolicyVersion: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  if (role === "viewer") return null
  const t = COPY[locale]
  const paid = tier === "paid"
  const billingHref = `/${locale}/owner/${workspaceSlug}/settings/billing`

  async function rescan() {
    if (!locationId || !paid || busy) return
    setBusy(true)
    const result = await rescanLocation(workspaceId, locationId, { policyVersion: consentPolicyVersion, locale })
    setBusy(false)
    if (!result.ok) { toast.error(failureMessage(result, t)); return }
    toast.success(t.queued)
    router.push(`/${locale}/scanning/${encodeURIComponent(result.data.jobId)}`)
  }

  if (!paid) {
    return (
      <span className="rescan-gate">
        <Button type="button" variant="outline" disabled aria-describedby="rescan-tier-note"><RefreshCw /> {t.label}</Button>
        <small id="rescan-tier-note">{t.tier} <Link href={billingHref}>{t.billing}</Link></small>
      </span>
    )
  }
  // The rescan writes a policy-versioned public-evidence consent record. It
  // used to write one without ever asking -- so the row asserted an agreement
  // the owner had never been shown. This dialog is where that agreement is
  // actually given, and confirming it is what sends the version.
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" disabled={busy || !locationId} title={locationId ? undefined : t.chooseLocation}>
          {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} {t.label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.consentTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.consentBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="limitation-note">{t.consentVersion} {consentPolicyVersion}</p>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void rescan()}>{t.consentConfirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function failureMessage(result: Extract<ClientResult<unknown>, { ok: false }>, t: (typeof COPY)[PrototypeLocale]): string {
  if (result.error === "offline" || result.error === "network") return t.network
  if (result.error === "tier_required") return t.tier
  if (result.status === 403) return t.forbidden
  if (result.status === 404) return t.noScan
  if (result.status === 429) return t.limit
  return t.failed
}

const COPY = {
  en: {
    label: "Rescan",
    tier: "Rescans are part of the Growth Workspace plan.",
    billing: "See plans",
    chooseLocation: "Choose one location to rescan",
    queued: "Rescan queued; collecting fresh evidence.",
    network: "The server could not be reached; try again shortly.",
    forbidden: "Your role or location scope does not allow a rescan.",
    noScan: "This location has no finished scan to rescan yet.",
    limit: "Rescan limit reached for today (3 per workspace); try again tomorrow.",
    failed: "The rescan could not be queued.",
    cancel: "Cancel",
    consentTitle: "Collect fresh public evidence for this location?",
    consentBody: "A rescan re-reads the same public sources as the original scan — your Google Business Profile, public Instagram and website. It collects public evidence only, and nothing is published on your behalf. Confirming records your consent against the published policy version.",
    consentConfirm: "I agree, rescan now",
    consentVersion: "Policy version",
  },
  "zh-HK": {
    label: "重新掃描",
    tier: "重新掃描屬於增長工作台方案。",
    billing: "查看方案",
    chooseLocation: "請先選擇一個地點",
    queued: "已排隊重新掃描；正在收集最新證據。",
    network: "無法連接伺服器，請稍後再試。",
    forbidden: "你的角色或地點範圍不允許重新掃描。",
    noScan: "此地點尚未有已完成的掃描可供重新掃描。",
    limit: "今日的重新掃描次數已達上限（每個工作台 3 次），請明天再試。",
    failed: "未能排隊重新掃描。",
    cancel: "取消",
    consentTitle: "為這個地點重新收集公開證據？",
    consentBody: "重新掃描會再次讀取與首次掃描相同的公開來源：你的 Google 商戶檔案、公開 Instagram 及網站。只收集公開證據，不會代你發佈任何內容。確認即表示你就下列政策版本給予同意。",
    consentConfirm: "我同意，立即重新掃描",
    consentVersion: "政策版本",
  },
  "zh-TW": {
    label: "重新掃描",
    tier: "重新掃描屬於成長工作台方案。",
    billing: "查看方案",
    chooseLocation: "請先選擇一個據點",
    queued: "已排入重新掃描；正在收集最新證據。",
    network: "無法連線至伺服器，請稍後再試。",
    forbidden: "你的角色或據點範圍不允許重新掃描。",
    noScan: "此據點尚未有已完成的掃描可供重新掃描。",
    limit: "今日的重新掃描次數已達上限（每個工作台 3 次），請明天再試。",
    failed: "無法排入重新掃描。",
    cancel: "取消",
    consentTitle: "為這個據點重新收集公開證據？",
    consentBody: "重新掃描會再次讀取與首次掃描相同的公開來源：你的 Google 商家檔案、公開 Instagram 與網站。只收集公開證據，不會代你發布任何內容。確認即表示你就下列政策版本給予同意。",
    consentConfirm: "我同意，立即重新掃描",
    consentVersion: "政策版本",
  },
} as const satisfies Record<PrototypeLocale, Record<string, string>>
