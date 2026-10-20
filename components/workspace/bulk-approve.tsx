"use client"

import { BadgeCheck, CircleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { interpolate } from "@/lib/share"
import type { BulkApproveItem } from "@/lib/workspace/bulk-approve"
import { approveVersion } from "@/lib/workspace/client"

type Outcome = "approved" | "failed"

/**
 * Approve several safe drafts from the queue (review replies and social
 * posts only; see lib/workspace/bulk-approve.ts). Every draft's full text is
 * shown and must be ticked as read before it can be approved. Approvals run
 * one at a time through the existing approve route, which re-checks role,
 * scope and state; a refusal is reported per draft and never retried.
 */
export function BulkApprove({ locale, items }: { locale: PrototypeLocale; items: BulkApproveItem[] }) {
  const t = copy[locale].shell.bulk
  const router = useRouter()
  const [read, setRead] = useState<Set<string>>(() => new Set())
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  const [running, setRunning] = useState(false)
  if (items.length === 0) return null

  const pending = items.filter((item) => outcomes[item.versionId] !== "approved")
  const selected = pending.filter((item) => read.has(item.versionId))
  const approvedCount = items.filter((item) => outcomes[item.versionId] === "approved").length
  const finished = Object.keys(outcomes).length > 0 && !running

  const toggle = (versionId: string, checked: boolean) => setRead((current) => {
    const next = new Set(current)
    if (checked) next.add(versionId)
    else next.delete(versionId)
    return next
  })

  async function approveSelected() {
    setRunning(true)
    for (const item of selected) {
      const result = await approveVersion(item.versionId)
      setOutcomes((current) => ({ ...current, [item.versionId]: result.ok ? "approved" : "failed" }))
    }
    setRunning(false)
    router.refresh()
  }

  return (
    <section className="bulk-approve" aria-labelledby="bulk-approve-title">
      <div>
        <h2 id="bulk-approve-title">{interpolate(t.title, { count: items.length })}</h2>
        <p>{t.body}</p>
      </div>
      <Dialog>
        <DialogTrigger asChild><Button><BadgeCheck aria-hidden="true" />{t.open}</Button></DialogTrigger>
        <DialogContent className="bulk-approve-dialog">
          <DialogHeader>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
            <DialogDescription>{t.dialogBody}</DialogDescription>
          </DialogHeader>
          <ul className="bulk-approve-list">
            {items.map((item) => {
              const outcome = outcomes[item.versionId]
              return (
                <li key={item.versionId} data-outcome={outcome}>
                  <strong>{resolveText(item.title, locale)}</strong>
                  <small>{interpolate(t.version, { n: item.versionNo })}</small>
                  <blockquote>{item.body}</blockquote>
                  {outcome === "approved" ? (
                    <span className="bulk-approve-status"><BadgeCheck aria-hidden="true" />{t.approved}</span>
                  ) : (
                    <>
                      {outcome === "failed" && <span className="bulk-approve-status" role="alert"><CircleAlert aria-hidden="true" />{t.failed}</span>}
                      <label className="bulk-approve-read">
                        <Checkbox checked={read.has(item.versionId)} disabled={running} onCheckedChange={(value) => toggle(item.versionId, value === true)} />
                        <span>{t.read}</span>
                      </label>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          {finished && <p role="status">{interpolate(t.done, { approved: approvedCount, total: items.length })}</p>}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">{t.cancel}</Button></DialogClose>
            <Button onClick={() => void approveSelected()} disabled={running || selected.length === 0}>
              <BadgeCheck aria-hidden="true" />{running ? t.approving : interpolate(t.approve, { count: selected.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
