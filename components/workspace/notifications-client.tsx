"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Check, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { PrototypeLocale } from "@/lib/copy"
import { saveNotificationPreferences } from "@/lib/workspace/client"

export type EmailPreferences = { rescanComplete: boolean; regressionAlert: boolean; monthlyDigest: boolean }

/**
 * The three email switches of the notifications page, live since Phase 6:
 * the prototype's "Save preferences" button PATCHes the copied
 * notification-preferences route (any accepted member, CLAUDE.md §3.1) and
 * toasts on save. Only changed switches are sent, so two members editing
 * different toggles never overwrite each other.
 */
export function NotificationPreferencesForm({ locale, workspaceId, initial }: { locale: PrototypeLocale; workspaceId: string; initial: EmailPreferences }) {
  const router = useRouter()
  const t = COPY[locale]
  const [prefs, setPrefs] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const dirty = prefs.rescanComplete !== saved.rescanComplete || prefs.regressionAlert !== saved.regressionAlert || prefs.monthlyDigest !== saved.monthlyDigest

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dirty || busy) return
    setBusy(true)
    const result = await saveNotificationPreferences(workspaceId, {
      ...(prefs.rescanComplete !== saved.rescanComplete ? { notifyRescanComplete: prefs.rescanComplete } : {}),
      ...(prefs.regressionAlert !== saved.regressionAlert ? { notifyRegressionAlert: prefs.regressionAlert } : {}),
      ...(prefs.monthlyDigest !== saved.monthlyDigest ? { notifyMonthlyDigest: prefs.monthlyDigest } : {}),
    })
    setBusy(false)
    if (!result.ok) { toast.error(result.error === "offline" || result.error === "network" ? t.network : t.failed); return }
    setSaved(prefs)
    toast.success(t.saved)
    router.refresh()
  }

  const rows: Array<{ key: keyof EmailPreferences; id: string; title: string; note: string }> = [
    { key: "rescanComplete", id: "rescan-alert", title: t.rescan, note: t.rescanNote },
    { key: "regressionAlert", id: "regression-alert", title: t.regression, note: t.regressionNote },
    { key: "monthlyDigest", id: "monthly-digest", title: t.digest, note: t.digestNote },
  ]
  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="switch-list">
        {rows.map((row) => (
          <Label key={row.id} htmlFor={row.id}>
            <Switch id={row.id} checked={prefs[row.key]} disabled={busy} onCheckedChange={(checked) => setPrefs((current) => ({ ...current, [row.key]: checked }))} />
            <span><strong>{row.title}</strong><small>{row.note}</small></span>
          </Label>
        ))}
      </div>
      <div className="plan-actions">
        <Button type="submit" disabled={!dirty || busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />} {t.save}</Button>
      </div>
    </form>
  )
}

const COPY = {
  en: {
    rescan: "Rescan complete", rescanNote: "One email when a scan finishes",
    regression: "Regression alert", regressionNote: "When a comparable scan regresses",
    digest: "Monthly digest", digestNote: "A monthly summary of what changed",
    save: "Save preferences", saved: "Notification preferences saved.",
    network: "The server could not be reached; try again shortly.", failed: "The preferences could not be saved.",
  },
  "zh-HK": {
    rescan: "重新掃描完成", rescanNote: "每次掃描完成後一封電郵",
    regression: "退步提示", regressionNote: "可比較掃描出現退步時",
    digest: "每月摘要", digestNote: "每月一次的成效摘要",
    save: "儲存偏好設定", saved: "通知偏好設定已儲存。",
    network: "無法連接伺服器，請稍後再試。", failed: "未能儲存偏好設定。",
  },
  "zh-TW": {
    rescan: "重新掃描完成", rescanNote: "每次掃描完成後一封電子郵件",
    regression: "退步提醒", regressionNote: "可比較掃描出現退步時",
    digest: "每月摘要", digestNote: "每月一次的成效摘要",
    save: "儲存偏好設定", saved: "通知偏好設定已儲存。",
    network: "無法連線至伺服器，請稍後再試。", failed: "無法儲存偏好設定。",
  },
} as const satisfies Record<PrototypeLocale, Record<string, string>>
