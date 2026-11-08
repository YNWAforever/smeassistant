import Link from "next/link"
import { TriangleAlert } from "lucide-react"

import { RescanButton } from "@/components/workspace/rescan-button"
import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { copy } from "@/lib/copy"
import { canRescan, rescanOwnerCopy } from "@/lib/workspace/rescan-eligibility"
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
  const rescanAllowed = problem.ownerAction === "rescan" && canRescan({ tier: surface.tier, role: surface.role, locationId: problem.locationId })
  // Owners never see workspace_processing (buildOwnerProblems already filters
  // it out via visibleTo), but `problem.kind` is the wider FailureKind; this
  // guard narrows it for problemTitle without casting away that protection.
  if (!isOwnerFailureKind(problem.kind)) return null
  return (
    <article className="brief-action-meta" data-problem={problem.kind}>
      <div>
        <p><TriangleAlert aria-hidden="true" /> {ownerProblemSentence(problem, locale, rescanAllowed)}</p>
        <details className="owner-disclosure"><summary>{copy[locale].home.trust}</summary>
          <p>{problemTitle(locale, problem.kind)} · {problemReasonLabel(locale, problem.reason)} {nextStepText(locale, problem)}</p>
          <small>{t(locale, "problems.reference", { reference: problem.reference })}</small>
        </details>
      </div>
      <ProblemControl problem={problem} {...surface} />
    </article>
  )
}

function ownerProblemSentence(problem: OwnerProblem, locale: PrototypeLocale, allowed: boolean): string {
  if (problem.kind === "google_connection") return locale === "zh-HK" ? "Google 暫時連唔到，要再連一次。" : locale === "zh-TW" ? "Google 暫時連不上，請重新連接。" : "Google is disconnected; connect it again.";
  if (problem.kind === "draft_failed") return locale === "zh-HK" ? "呢張稿未寫好，開返就可以再試。" : locale === "zh-TW" ? "這張稿還沒寫好，開啟後可以再試。" : "This draft could not be written; reopen it to try again.";
  if (!allowed) return rescanOwnerCopy[locale].next;
  return locale === "zh-HK" ? "今次未睇完舖頭，再掃一次就可以再試。" : locale === "zh-TW" ? "這次還沒看完店裡的狀況，可以再掃一次。" : "We could not finish checking the shop; try another scan.";
}

function ProblemControl({ problem, locale, workspaceSlug, workspaceId, tier, role, consentPolicyVersion }: ProblemSurfaceProps & { problem: OwnerProblem }) {
  if (role === "viewer" || problem.ownerAction === "ask_owner") return <Button disabled>{copy[locale].shell.access.askOwnerAction}</Button>
  switch (problem.ownerAction) {
    case "rescan":
      return <RescanButton locale={locale} workspaceId={workspaceId} workspaceSlug={workspaceSlug} locationId={problem.locationId} tier={tier} role={role} consentPolicyVersion={consentPolicyVersion} label={rescanOwnerCopy[locale].retry} />
    case "open_action":
      return problem.actionId ? (
        <Button asChild variant="outline"><Link href={`/${locale}/owner/${workspaceSlug}/actions/${problem.actionId}`}>{t(locale, "problems.button.open_action")}</Link></Button>
      ) : null
    case "reauthorise":
      return <Button asChild><a href={`/api/oauth/google/start?workspace=${encodeURIComponent(workspaceSlug)}&locale=${locale}`}>{t(locale, "problems.button.reauthorise")}</a></Button>
    case "contact_support":
      return problem.contactHref ? <Button asChild variant="outline"><a href={problem.contactHref}>{t(locale, "problems.button.contact_support")}</a></Button> : null
    case "none":
      return null
  }
}
