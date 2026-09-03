"use client"

import { useEffect, useState } from "react"
import { Check, Sparkles, X } from "lucide-react"

import { SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { listDrafts, reviewDraft, type OwnerFixPackDraft } from "@/lib/owner/fix-pack-card-client"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"

/**
 * Pending + approved Fix Pack drafts (agent_runs) on the owner Home. Every
 * role sees the list; only owner/manager see Approve/Reject -- display
 * convenience mirroring the PATCH route's server-side gate, not the security
 * boundary. Fetched client-side on mount, unlike the brief's server-threaded
 * data: drafts are actionable, mutable state. A successful review updates
 * local state optimistically; a FAILED review refetches the list instead,
 * because the most likely failure is the PATCH's 409 (someone else already
 * reviewed the row), and the honest response to "my view was stale" is
 * fresh data, not an error banner over a stale row.
 *
 * Ported from upstream's components/owner/fix-pack-card.tsx onto the
 * prototype's SectionCard / compact-action-list styling.
 */
export function FixPackCard({ locale, workspaceId, viewerRole }: { locale: PrototypeLocale; workspaceId: string; viewerRole: WorkspaceRole }) {
  const isChinese = locale !== "en"
  const [drafts, setDrafts] = useState<OwnerFixPackDraft[] | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const canApprove = viewerRole === "owner" || viewerRole === "manager"

  useEffect(() => {
    let cancelled = false
    listDrafts(workspaceId, locale).then((result) => {
      if (cancelled) return
      if (result.ok) setDrafts(result.drafts)
      else setError(true)
    })
    return () => {
      cancelled = true
    }
  }, [workspaceId, locale])

  async function handleReview(runId: string, status: "approved" | "rejected") {
    setError(false)
    setBusy(runId)
    const result = await reviewDraft(workspaceId, runId, status)
    setBusy(null)
    if (!result.ok) {
      setError(true)
      // Converge with the server rather than leaving a stale pending row
      // whose buttons would just fail again (e.g. after a 409 race).
      const refreshed = await listDrafts(workspaceId, locale)
      if (refreshed.ok) setDrafts(refreshed.drafts)
      return
    }
    setDrafts((current) =>
      (current ?? []).flatMap((draft) => {
        if (draft.id !== runId) return [draft]
        // Approved drafts stay visible (they're the delivery surface);
        // rejected ones drop out, matching the GET's own filter.
        return status === "approved" ? [{ ...draft, status: "approved" }] : []
      }),
    )
  }

  const pending = (drafts ?? []).filter((d) => d.status === "draft").length

  return (
    <SectionCard className="fix-pack-card">
      <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "Fix Pack 草稿" : "Fix Pack drafts"}</p><h2>{isChinese ? "由掃描發現生成的回覆及帖文" : "Replies and posts drafted from scan findings"}</h2></div><Badge variant="outline"><Sparkles /> {isChinese ? `${pending} 份待審` : `${pending} pending`}</Badge></div>
      {drafts === null ? (
        // Covers both "still loading" and "initial load failed" -- rendering
        // the empty-state copy under a load FAILURE would assert something the
        // card doesn't know.
        !error && <p>{isChinese ? "載入中…" : "Loading…"}</p>
      ) : drafts.length === 0 ? (
        <p>{isChinese ? "暫時沒有 Fix Pack 草稿。付費方案的掃描完成後，草稿會在這裡出現。" : "No Fix Pack drafts yet. Drafts appear here after a paid-tier scan completes."}</p>
      ) : (
        <div className="fix-pack-list">
          {drafts.map((draft) => (
            <article key={draft.id} className="fix-pack-draft">
              <p className="eyebrow">{draft.businessName ? `${draft.businessName} · ` : ""}{draft.findingLabel} · {draft.status === "draft" ? (isChinese ? "待審批" : "Pending approval") : (isChinese ? "已核准" : "Approved")}</p>
              {draft.reviewExcerpt && <blockquote className="limitation-note">{draft.reviewRating !== null && <span>★ {draft.reviewRating} · </span>}{draft.reviewExcerpt}</blockquote>}
              {draft.draftText && <p style={{ whiteSpace: "pre-wrap" }}>{draft.draftText}</p>}
              {canApprove && draft.status === "draft" && (
                <div className="plan-actions">
                  <Button size="sm" disabled={busy === draft.id} onClick={() => handleReview(draft.id, "approved")}><Check /> {isChinese ? "核准" : "Approve"}</Button>
                  <Button size="sm" variant="outline" disabled={busy === draft.id} onClick={() => handleReview(draft.id, "rejected")}><X /> {isChinese ? "拒絕" : "Reject"}</Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {error && <p className="limitation-note" role="alert">{isChinese ? "操作未能完成，已重新載入最新狀態。" : "The action could not be completed; the latest state has been reloaded."}</p>}
      {!canApprove && drafts && drafts.length > 0 && <p className="limitation-note">{isChinese ? "檢視者只可查看草稿；核准由店主或經理處理。" : "Viewers can inspect drafts; approval is for owners and managers."}</p>}
    </SectionCard>
  )
}
