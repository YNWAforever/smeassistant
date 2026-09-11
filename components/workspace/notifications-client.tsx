"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { Check, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { formatDateTime } from "@/lib/workspace/format"
import type { NotificationRow } from "@/lib/workspace/queries-pages"
import { markNotificationsRead, saveNotificationPreferences } from "@/lib/workspace/client"

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

/**
 * The in-app notification list (P2.5 item 24). `read_at` existed from the
 * Phase 6 migration and nothing ever wrote it, so the topbar bell's unread dot
 * could never go out.
 *
 * Two affordances, deliberately different in strength:
 *
 * - "Mark all as read" awaits the server and refreshes, so the badge going to
 *   zero reflects a write that actually happened.
 * - Opening a row fires the mark without blocking the navigation, because
 *   holding a click to await a PATCH would also break middle-click and
 *   ctrl-click. If that request fails, nothing is claimed permanently: the row
 *   is re-read from the server on the next load and comes back unread.
 */
export function NotificationList({ locale, workspaceId, timezone, rows }: { locale: PrototypeLocale; workspaceId: string; timezone: string; rows: NotificationRow[] }) {
  const router = useRouter()
  const t = COPY[locale]
  const [busy, setBusy] = useState(false)
  const unread = rows.filter((row) => !row.read_at).length

  async function markAll() {
    if (busy || unread === 0) return
    setBusy(true)
    const result = await markNotificationsRead(workspaceId)
    setBusy(false)
    if (!result.ok) { toast.error(result.error === "offline" || result.error === "network" ? t.network : t.markFailed); return }
    toast.success(t.marked)
    router.refresh()
  }

  if (rows.length === 0) return <p>{t.empty}</p>
  return (
    <>
      <div className="compact-action-list">
        {rows.map((row) => {
          const body = <div><strong>{resolveText(row.title, locale)}</strong><small>{row.body ? resolveText(row.body, locale) : ""} · {formatDateTime(row.created_at, locale, timezone)}</small></div>
          const className = row.read_at ? "" : "is-unread"
          return row.href
            ? <Link key={row.id} href={row.href} className={className} onClick={() => { if (!row.read_at) void markNotificationsRead(workspaceId, [row.id]) }}>{body}</Link>
            : <div key={row.id} className={className}>{body}</div>
        })}
      </div>
      <div className="plan-actions">
        <Button type="button" variant="outline" onClick={() => void markAll()} disabled={busy || unread === 0}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />} {t.markAll}</Button>
      </div>
    </>
  )
}

const COPY = {
  en: {
    // "One email when a scan finishes" asserted a send. No mail sender exists,
    // so each note now names the trigger only; the card states that email
    // delivery is not enabled yet.
    rescan: "Rescan complete", rescanNote: "When a scan finishes",
    regression: "Regression alert", regressionNote: "When a comparable scan regresses",
    digest: "Monthly digest", digestNote: "A monthly summary of what changed",
    save: "Save preferences", saved: "Notification preferences saved.",
    network: "The server could not be reached; try again shortly.", failed: "The preferences could not be saved.",
    markAll: "Mark all as read", marked: "Notifications marked as read.", markFailed: "The notifications could not be marked as read.",
    empty: "No notifications yet.",
  },
  "zh-HK": {
    rescan: "重新掃描完成", rescanNote: "每次掃描完成時",
    regression: "退步提示", regressionNote: "可比較掃描出現退步時",
    digest: "每月摘要", digestNote: "每月一次的成效摘要",
    save: "儲存偏好設定", saved: "通知偏好設定已儲存。",
    network: "無法連接伺服器，請稍後再試。", failed: "未能儲存偏好設定。",
    markAll: "全部標示為已讀", marked: "通知已標示為已讀。", markFailed: "未能標示通知為已讀。",
    empty: "尚未有通知。",
  },
  "zh-TW": {
    rescan: "重新掃描完成", rescanNote: "每次掃描完成時",
    regression: "退步提醒", regressionNote: "可比較掃描出現退步時",
    digest: "每月摘要", digestNote: "每月一次的成效摘要",
    save: "儲存偏好設定", saved: "通知偏好設定已儲存。",
    network: "無法連線至伺服器，請稍後再試。", failed: "無法儲存偏好設定。",
    markAll: "全部標示為已讀", marked: "通知已標示為已讀。", markFailed: "無法將通知標示為已讀。",
    empty: "目前沒有通知。",
  },
} as const satisfies Record<PrototypeLocale, Record<string, string>>
