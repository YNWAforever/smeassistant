"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * The decision form. Disabled entirely when DEC-06 has not been settled, with
 * copy that names what is actually missing rather than saying "coming soon".
 * The route enforces the same gate; this only stops the operator wasting typing.
 *
 * English copy on a locale-prefixed route: a deliberate, recorded exception to
 * CLAUDE.md section 5's trilingual rule, because the audience is a handful of
 * Fimmick operators rather than merchants.
 */
export function AccessRequestDecision({ requestId, enabled, resolved }: { requestId: string; enabled: boolean; resolved: boolean }) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [method, setMethod] = useState("")
  const [verifiedBy, setVerifiedBy] = useState("")
  const [busy, setBusy] = useState(false)

  async function decide(decision: "approved" | "rejected" | "needs_information") {
    if (busy) return
    if (!reason.trim()) { toast.error("Record why."); return }
    if (decision !== "needs_information" && (!method.trim() || !verifiedBy.trim())) {
      toast.error("Record what you verified and who verified it.")
      return
    }
    setBusy(true)
    const response = await fetch(`/api/ops/access-requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        reason: reason.trim(),
        ...(decision === "needs_information" ? {} : { verification: { method: method.trim(), verified_by: verifiedBy.trim() } }),
      }),
    })
    setBusy(false)
    if (response.ok) { toast.success("Decision recorded."); router.refresh(); return }
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    if (body.error === "already_claimed") toast.error("The job was claimed while this request waited; nothing was created.")
    else if (body.error === "already_decided") toast.error("Someone else decided this request first.")
    else toast.error(`The decision was refused (${body.error ?? response.status}).`)
    router.refresh()
  }

  if (resolved) return <p>This request has already been decided.</p>
  if (!enabled) {
    return (
      <p className="limitation-note" role="status">
        Decisions are disabled until a named accountable operating role and an approved independent-verification procedure are recorded (DEC-06).
      </p>
    )
  }

  return (
    <div className="field-stack">
      <Label htmlFor="decision-reason">Why</Label>
      <Textarea id="decision-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
      <Label htmlFor="decision-method">What independent control or authority did you verify?</Label>
      <Input id="decision-method" value={method} onChange={(event) => setMethod(event.target.value)} disabled={busy} />
      <Label htmlFor="decision-by">Verified by</Label>
      <Input id="decision-by" value={verifiedBy} onChange={(event) => setVerifiedBy(event.target.value)} disabled={busy} />
      <div className="draft-editor-actions">
        <Button onClick={() => void decide("approved")} disabled={busy}>Approve and assign</Button>
        <Button variant="outline" onClick={() => void decide("needs_information")} disabled={busy}>Ask for more</Button>
        <Button variant="ghost" className="text-destructive" onClick={() => void decide("rejected")} disabled={busy}>Reject</Button>
      </div>
    </div>
  )
}
