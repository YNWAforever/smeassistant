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
import { t } from "@/lib/i18n"
import { formatDateTime } from "@/lib/workspace/format"
import type { NotificationRow } from "@/lib/workspace/queries-pages"
import { markNotificationsRead, saveMyMailPreferences, saveNotificationPreferences } from "@/lib/workspace/client"

export type EmailPreferences = { rescanComplete: boolean; regressionAlert: boolean; monthlyDigest: boolean }
export type MyEmailPreferences = { rescanComplete: boolean; regressionAlert: boolean }

/**
 * The workspace's "allow these emails" gates (docs/superpowers/specs/2026-
 * 09-27-mail-outbox-design.md §6): PATCHes the owner-only notification-
 * preferences route and toasts on save. Only changed switches are sent, so
 * two owners editing different toggles never overwrite each other.
 * `disabled` (a non-owner, per global-constraints.md departure 2) turns
 * every switch read-only and removes the Save action -- there is nothing
 * here for a manager or viewer to submit.
 */
export function WorkspaceMailSwitchesForm({ locale, workspaceId, initial, disabled }: { locale: PrototypeLocale; workspaceId: string; initial: EmailPreferences; disabled: boolean }) {
  const router = useRouter()
  const c = COPY[locale]
  const [prefs, setPrefs] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const dirty = prefs.rescanComplete !== saved.rescanComplete || prefs.regressionAlert !== saved.regressionAlert || prefs.monthlyDigest !== saved.monthlyDigest

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || !dirty || busy) return
    setBusy(true)
    const result = await saveNotificationPreferences(workspaceId, {
      ...(prefs.rescanComplete !== saved.rescanComplete ? { notifyRescanComplete: prefs.rescanComplete } : {}),
      ...(prefs.regressionAlert !== saved.regressionAlert ? { notifyRegressionAlert: prefs.regressionAlert } : {}),
      ...(prefs.monthlyDigest !== saved.monthlyDigest ? { notifyMonthlyDigest: prefs.monthlyDigest } : {}),
    })
    setBusy(false)
    if (!result.ok) { toast.error(result.error === "offline" || result.error === "network" ? c.network : c.failed); return }
    setSaved(prefs)
    toast.success(c.saved)
    router.refresh()
  }

  const rows: Array<{ key: keyof EmailPreferences; id: string; title: string }> = [
    { key: "rescanComplete", id: "workspace-rescan-alert", title: t(locale, "mail.rescanComplete") },
    { key: "regressionAlert", id: "workspace-regression-alert", title: t(locale, "mail.regressionAlert") },
    { key: "monthlyDigest", id: "workspace-monthly-digest", title: t(locale, "mail.monthlyDigest") },
  ]
  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="switch-list">
        {rows.map((row) => (
          <Label key={row.id} htmlFor={row.id}>
            <Switch id={row.id} checked={prefs[row.key]} disabled={disabled || busy} onCheckedChange={(checked) => setPrefs((current) => ({ ...current, [row.key]: checked }))} />
            <span><strong>{row.title}</strong></span>
          </Label>
        ))}
      </div>
      {!disabled && (
        <div className="plan-actions">
          <Button type="submit" disabled={!dirty || busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />} {c.save}</Button>
        </div>
      )}
    </form>
  )
}

/**
 * Any member's own two mail opt-ins (docs/superpowers/specs/2026-09-27-
 * mail-outbox-design.md §6): PATCHes /my-mail-preferences with the current
 * page locale on every save, whatever role the caller holds -- the workspace
 * gate above decides whether the *kind* may be mailed at all; this decides
 * whether *this member* wants it. `workspaceGates` is that gate as last
 * read from the server; a switch the member has on while its gate is off is
 * marked `mail.kindBlocked`, so "on" never reads as "will be mailed".
 */
export function MyMailPreferencesForm({ locale, workspaceId, initial, workspaceGates }: { locale: PrototypeLocale; workspaceId: string; initial: MyEmailPreferences; workspaceGates: MyEmailPreferences }) {
  const router = useRouter()
  const c = COPY[locale]
  const [prefs, setPrefs] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const dirty = prefs.rescanComplete !== saved.rescanComplete || prefs.regressionAlert !== saved.regressionAlert

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dirty || busy) return
    setBusy(true)
    const result = await saveMyMailPreferences(workspaceId, {
      ...(prefs.rescanComplete !== saved.rescanComplete ? { rescanComplete: prefs.rescanComplete } : {}),
      ...(prefs.regressionAlert !== saved.regressionAlert ? { regressionAlert: prefs.regressionAlert } : {}),
      locale,
    })
    setBusy(false)
    if (!result.ok) { toast.error(result.error === "offline" || result.error === "network" ? c.network : c.failed); return }
    setSaved(prefs)
    toast.success(c.saved)
    router.refresh()
  }

  const rows: Array<{ key: keyof MyEmailPreferences; id: string; title: string }> = [
    { key: "rescanComplete", id: "my-rescan-alert", title: t(locale, "mail.rescanComplete") },
    { key: "regressionAlert", id: "my-regression-alert", title: t(locale, "mail.regressionAlert") },
  ]
  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="switch-list">
        {rows.map((row) => (
          <Label key={row.id} htmlFor={row.id}>
            <Switch id={row.id} checked={prefs[row.key]} disabled={busy} onCheckedChange={(checked) => setPrefs((current) => ({ ...current, [row.key]: checked }))} />
            <span><strong>{row.title}</strong>{prefs[row.key] && !workspaceGates[row.key] && <small>{t(locale, "mail.kindBlocked")}</small>}</span>
          </Label>
        ))}
      </div>
      <div className="plan-actions">
        <Button type="submit" disabled={!dirty || busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />} {c.save}</Button>
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
  const c = COPY[locale]
  const [busy, setBusy] = useState(false)
  const unread = rows.filter((row) => !row.read_at).length

  async function markAll() {
    if (busy || unread === 0) return
    setBusy(true)
    const result = await markNotificationsRead(workspaceId)
    setBusy(false)
    if (!result.ok) { toast.error(result.error === "offline" || result.error === "network" ? c.network : c.markFailed); return }
    toast.success(c.marked)
    router.refresh()
  }

  if (rows.length === 0) return <p>{c.empty}</p>
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
        <Button type="button" variant="outline" onClick={() => void markAll()} disabled={busy || unread === 0}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />} {c.markAll}</Button>
      </div>
    </>
  )
}

const COPY = {
  en: {
    save: "Save preferences", saved: "Notification preferences saved.",
    network: "The server could not be reached; try again shortly.", failed: "The preferences could not be saved.",
    markAll: "Mark all as read", marked: "Notifications marked as read.", markFailed: "The notifications could not be marked as read.",
    empty: "No notifications yet.",
  },
  "zh-HK": {
    save: "儲存偏好設定", saved: "通知偏好設定已儲存。",
    network: "無法連接伺服器，請稍後再試。", failed: "未能儲存偏好設定。",
    markAll: "全部標示為已讀", marked: "通知已標示為已讀。", markFailed: "未能標示通知為已讀。",
    empty: "尚未有通知。",
  },
  "zh-TW": {
    save: "儲存偏好設定", saved: "通知偏好設定已儲存。",
    network: "無法連線至伺服器，請稍後再試。", failed: "無法儲存偏好設定。",
    markAll: "全部標示為已讀", marked: "通知已標示為已讀。", markFailed: "無法將通知標示為已讀。",
    empty: "目前沒有通知。",
  },
} as const satisfies Record<PrototypeLocale, Record<string, string>>
