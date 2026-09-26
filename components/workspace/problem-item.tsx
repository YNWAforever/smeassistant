import Link from "next/link"
import { TriangleAlert } from "lucide-react"

import { RescanButton } from "@/components/workspace/rescan-button"
import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import { isOwnerFailureKind, type OwnerProblem } from "@/lib/ops/failure-types"
import { nextStepText, problemReasonLabel, problemTitle } from "@/lib/ops/problem-copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"

export interface ProblemSurfaceProps {
  locale: PrototypeLocale
  workspaceSlug: string
  workspaceId: string
  tier: "lite" | "paid"
  role: WorkspaceRole
  consentPolicyVersion: string
}

/**
 * One owner-facing problem (P3.5b spec §3): what happened, the reason in
 * plain words, the next step, the reference, and the one control the
 * server resolved for this member. The routes behind each control enforce
 * the same rules; this is display, not the boundary.
 */
export function ProblemItem({ problem, ...surface }: ProblemSurfaceProps & { problem: OwnerProblem }) {
  const { locale } = surface
  // Owners never see workspace_processing (buildOwnerProblems already filters
  // it out via visibleTo), but `problem.kind` is the wider FailureKind; this
  // guard narrows it for problemTitle without casting away that protection.
  if (!isOwnerFailureKind(problem.kind)) return null
  return (
    <article className="brief-action-meta" data-problem={problem.kind}>
      <div>
        <h3><TriangleAlert aria-hidden="true" /> {problemTitle(locale, problem.kind)}</h3>
        <p>{problemReasonLabel(locale, problem.reason)} {nextStepText(locale, problem)}</p>
        <small>{t(locale, "problems.reference", { reference: problem.reference })}</small>
      </div>
      <ProblemControl problem={problem} {...surface} />
    </article>
  )
}

function ProblemControl({ problem, locale, workspaceSlug, workspaceId, tier, role, consentPolicyVersion }: ProblemSurfaceProps & { problem: OwnerProblem }) {
  switch (problem.ownerAction) {
    case "rescan":
      return <RescanButton locale={locale} workspaceId={workspaceId} workspaceSlug={workspaceSlug} locationId={problem.locationId} tier={tier} role={role} consentPolicyVersion={consentPolicyVersion} />
    case "open_action":
      return problem.actionId ? (
        <Button asChild variant="outline"><Link href={`/${locale}/owner/${workspaceSlug}/actions/${problem.actionId}`}>{t(locale, "problems.button.open_action")}</Link></Button>
      ) : null
    case "reauthorise":
      return <Button asChild><a href={`/api/oauth/google/start?workspace=${encodeURIComponent(workspaceSlug)}&locale=${locale}`}>{t(locale, "problems.button.reauthorise")}</a></Button>
    case "contact_support":
      return problem.contactHref ? <Button asChild variant="outline"><a href={problem.contactHref}>{t(locale, "problems.button.contact_support")}</a></Button> : null
    case "ask_owner":
    case "none":
      return null
  }
}
