"use client"

import { LockKeyhole } from "lucide-react"

import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"

/**
 * Sticky approval controls for one exact version (guardrail 5). It never
 * decides permission: `canApprove` comes from the server-resolved role, and
 * the routes enforce it again. Viewers see why, not disabled mystery buttons.
 */
export function ApprovalBar({
  versionNo,
  stateLabel,
  canApprove,
  busy = false,
  onApprove,
  onRequestChanges,
  locale,
}: {
  versionNo: number
  stateLabel: string
  canApprove: boolean
  busy?: boolean
  onApprove: () => void
  onRequestChanges?: () => void
  locale: PrototypeLocale
}) {
  const t = copy[locale].ui.approval
  return (
    <div className="kinnso-approval-bar flex flex-wrap items-center justify-between gap-3 px-4 py-3" role="region" aria-label={fill(t.versionLabel, { n: versionNo })}>
      <div className="grid gap-0.5">
        <strong className="text-sm text-ink">{fill(t.versionLabel, { n: versionNo })} · {stateLabel}</strong>
        <span className="inline-flex items-center gap-1 text-xs text-ink-3"><LockKeyhole aria-hidden="true" className="size-3.5" />{canApprove ? t.locked : t.viewerOnly}</span>
      </div>
      {canApprove && (
        <div className="flex flex-wrap gap-2">
          {onRequestChanges && <Button variant="outline" className="min-h-11" onClick={onRequestChanges} disabled={busy}>{t.requestChanges}</Button>}
          <Button className="kinnso-button-brand min-h-11" onClick={onApprove} disabled={busy} aria-busy={busy}>{t.approve}</Button>
        </div>
      )}
    </div>
  )
}
