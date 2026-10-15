"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Check, Sparkles, X } from "lucide-react"

import { SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { listDrafts, reviewDraft, type OwnerFixPackDraft } from "@/lib/owner/fix-pack-card-client"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { zhFor } from "@/lib/zh-tw"

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
 *
 * `mode="earlier"` (P4.2, work packs on): the same list, routes and review
 * controls, but it renders nothing unless at least one draft is pending, and then
 * lists only the pending drafts under "Earlier staff drafts". The old empty state
 * is gone: with the starter pack on Home, "drafts are not available" is noise.
 */
export function FixPackCard({ locale, workspaceId, viewerRole, actionsHref, createHref, mode = "full" }: { locale: PrototypeLocale; workspaceId: string; viewerRole: WorkspaceRole; actionsHref?: string; createHref?: string; mode?: "full" | "earlier" }) {
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
  const earlier = mode === "earlier"
  // Nothing to say until a pending draft is known to exist (while loading, after a failed load, or once the last one is reviewed).
  if (earlier && pending === 0) return null
  const visible = earlier ? (drafts ?? []).filter((d) => d.status === "draft") : drafts

  return (
    <SectionCard className="fix-pack-card">
      {/* "drafted from scan findings" implied the scan produces them, which it
          never does. The heading now describes what the surface IS -- a review
          queue for staff-prepared drafts -- without asserting that anything is
          currently filling it. */}
      <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "Fix Pack 草稿" : "Fix Pack drafts"}</p><h2>{earlier ? copy[locale].workspace.packs.earlierDrafts : isChinese ? zhFor(locale, "由職員準備、待你審批的回覆及帖文") : "Staff-prepared replies and posts awaiting your review"}</h2></div><Badge variant="outline"><Sparkles /> {isChinese ? `${pending} 份待審` : `${pending} pending`}</Badge></div>
      {visible === null ? (
        // Covers both "still loading" and "initial load failed" -- rendering
        // the empty-state copy under a load FAILURE would assert something the
        // card doesn't know.
        !error && <p>{isChinese ? "載入中…" : "Loading…"}</p>
      ) : visible.length === 0 ? (
        <>
          <p>{isChinese ? zhFor(locale, "目前沒有待審閱的職員草稿。你可以在「製作內容」準備自己的評論回覆或帖文。") : "No staff drafts to review. You can prepare your own review replies or posts in Create content."}</p>
          {createHref && <p><Link href={createHref}>{isChinese ? zhFor(locale, "製作內容") : "Create content"}</Link></p>}
          {actionsHref && <p className="limitation-note"><Link href={actionsHref}>{isChinese ? "查看草稿" : "Open drafts"}</Link></p>}
        </>
      ) : (
        <div className="fix-pack-list">
          {visible.map((draft) => (
            <article key={draft.id} className="fix-pack-draft">
              <p className="eyebrow">{draft.businessName ? `${draft.businessName} · ` : ""}{draft.findingLabel} · {draft.status === "draft" ? (isChinese ? zhFor(locale, "待審批") : "Pending approval") : (isChinese ? "已核准" : "Approved")}</p>
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
      {error && <p className="limitation-note" role="alert">{drafts === null ? (isChinese ? zhFor(locale, "未能載入職員草稿，請重新整理頁面再試。") : "Could not load staff drafts. Refresh the page to try again.") : (isChinese ? zhFor(locale, "操作未能完成，請檢查最新狀態再試。") : "The action could not be completed. Check the latest state and try again.")}</p>}
      {!canApprove && drafts && drafts.length > 0 && <p className="limitation-note">{isChinese ? zhFor(locale, "檢視者只可查看草稿；核准由店主或經理處理。") : "Viewers can inspect drafts; approval is for owners and managers."}</p>}
    </SectionCard>
  )
}
