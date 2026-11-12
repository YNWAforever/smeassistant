import Link from "next/link"
import { ArrowRight, FileClock } from "lucide-react"

import { CopyFollowUpCard } from "@/components/workspace/copy-follow-up-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { homeReviewCopy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { ownerCheckNextStep } from "@/lib/workspace/owner-review-check"
import { withLocation } from "@/lib/workspace/format"
import type { HomeBrief } from "@/lib/workspace/queries-pages"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"

/**
 * The two follow-ups Home still owns: a clipboard-confirmed copy ("did you
 * post it?") and an applied review reply that can record its owner check.
 * They stay below the primary step because they are follow-through, never a
 * second competing priority.
 */
export function HomeFollowUps({
  locale,
  workspaceSlug,
  workspaceId,
  location,
  brief,
  role,
}: {
  locale: PrototypeLocale
  workspaceSlug: string
  workspaceId: string
  location: string
  brief: HomeBrief
  role: WorkspaceRole
}) {
  const copyFollowUp = brief.copyFollowUp?.workspaceId === workspaceId ? brief.copyFollowUp : null
  const followUp = brief.reviewFollowUp?.workspaceId === workspaceId ? brief.reviewFollowUp : null
  const reviewText = homeReviewCopy[locale]
  if (!copyFollowUp && !followUp) return null
  const href = followUp ? withLocation(`/${locale}/owner/${workspaceSlug}/actions/${encodeURIComponent(followUp.actionId)}?version=${encodeURIComponent(followUp.versionId)}`, location) : ""
  return (
    <>
      {copyFollowUp && <CopyFollowUpCard followUp={copyFollowUp} locale={locale} viewer={role === "viewer"} />}
      {followUp && (
        <section className="home-v2-followup" data-testid="home-review-followup" aria-label={reviewText.title}>
          <div className="home-v2-section-head">
            <div>
              <p className="home-v2-eyebrow">{reviewText.title}</p>
              <h2>{resolveText(followUp.title, locale)}</h2>
              <p>{followUp.versionNo ? reviewText.version.replace("{n}", String(followUp.versionNo)) : null} · {reviewText.applied}</p>
            </div>
            <Badge variant="outline">{reviewText.completed}</Badge>
          </div>
          <p data-testid="home-owner-check-status">{followUp.currentCheck ? resolveText(ownerCheckNextStep(followUp.currentCheck.decision), locale) : reviewText.next}</p>
          <p className="limitation-note">{reviewText.independent}</p>
          <div className="home-v2-next-actions">
            <Button asChild variant="outline"><Link href={href} prefetch={false}>{followUp.canRecord && role !== "viewer" && followUp.currentCheck?.decision !== "checked" ? reviewText.check : reviewText.view}<ArrowRight aria-hidden="true" /></Link></Button>
          </div>
          {followUp.newerDraft && (
            <p className="home-v2-followup-newer">
              <FileClock aria-hidden="true" />
              <Link href={withLocation(`/${locale}/owner/${workspaceSlug}/actions/${encodeURIComponent(followUp.actionId)}?version=${encodeURIComponent(followUp.newerDraft.id)}`, location)} prefetch={false}>
                {reviewText.reviewDraft.replace("{n}", String(followUp.newerDraft.versionNo)).replace("{applied}", String(followUp.versionNo))}
              </Link>
            </p>
          )}
        </section>
      )}
    </>
  )
}
