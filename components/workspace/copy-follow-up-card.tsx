"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { markApplied, recordCopyFollowUp } from "@/lib/workspace/client"
import { copyFollowUpCopy, type HomeCopyFollowUp } from "@/lib/workspace/copy-follow-up"

/** One simple question about the exact copied text. No owner check or verification claim. */
export function CopyFollowUpCard({ followUp, locale, viewer = false }: { followUp: HomeCopyFollowUp; locale: PrototypeLocale; viewer?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const t = copyFollowUpCopy[locale]
  async function answer(decision: "posted" | "not_yet" | "later") {
    if (viewer || !followUp.canRecord || pending.current) return
    pending.current = true
    setBusy(true)
    const result = decision === "posted"
      ? await markApplied(followUp.actionId, { output_version_id: followUp.versionId })
      : await recordCopyFollowUp(followUp.actionId, { versionId: followUp.versionId, expectedRecordId: followUp.id, decision, locale })
    setBusy(false)
    pending.current = false
    if (!result.ok) {
      toast.error(t.failed)
      if (result.status === 409) router.refresh()
      return
    }
    toast.success(decision === "later" ? t.laterSaved : t.saved)
    router.refresh()
  }
  return <article className="brief-priority-card" data-testid="home-copy-followup">
    <h2>{t.title}</h2>
    <p className="coach-sentence">{resolveText(followUp.title, locale)} · {t.body}</p>
    <div className="brief-priority-actions">{viewer || !followUp.canRecord
      ? <Button disabled>{copy[locale].shell.access.askOwnerAction}</Button>
      : <><Button disabled={busy} onClick={() => void answer("posted")}>{t.posted}</Button><Button variant="outline" disabled={busy} onClick={() => void answer("not_yet")}>{t.notYet}</Button><Button variant="ghost" disabled={busy} onClick={() => void answer("later")}>{t.later}</Button></>}</div>
  </article>
}
