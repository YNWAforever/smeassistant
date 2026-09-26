"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"

const MESSAGES: Record<string, string> = {
  not_dead_lettered: "This scan is no longer stuck: it was closed, claimed or released by someone else.",
  release_failed: "The release could not be recorded. Try again.",
}

/** P3.5b: grants a dead-lettered scan one more attempt. The route is the authority; this only posts and reports. */
export function ReleaseButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function release() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/ops/failures/scans/${encodeURIComponent(jobId)}/release`, { method: "POST", headers: { accept: "application/json" } })
      const body = (await response.json().catch(() => null)) as { error?: string; dispatched?: boolean } | null
      if (response.ok) {
        setMessage(body?.dispatched ? "Released and dispatched." : "Released. The next cron tick will pick it up.")
        router.refresh()
      } else {
        setMessage(MESSAGES[body?.error ?? ""] ?? "The release failed.")
      }
    } catch {
      setMessage("The server could not be reached.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={release} disabled={busy}>
        {busy ? "Releasing…" : "Release for one more attempt"}
      </Button>
      {message && <small role="status">{message}</small>}
    </span>
  )
}
