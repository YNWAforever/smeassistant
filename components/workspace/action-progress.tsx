import { VersionDiff } from "@/components/kinnso/version-diff"
import { ApprovalFlow } from "@/components/visual/steps"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { ApprovalFlowStep } from "@/lib/copy-visual"
import type { VersionRow } from "@/lib/workspace/queries-pages"

/**
 * Where the latest version is in draft → needs approval → approved →
 * delivered (guardrails 5–7). Approval locks one exact version, so a
 * rejected or superseded latest version is back at "draft", and only a
 * version that has actually been exported or published reads as delivered.
 */
export function approvalStepFor(version: Pick<VersionRow, "approval_state" | "delivery_state" | "first_exported_at">): ApprovalFlowStep {
  if (version.approval_state === "approved") {
    return version.first_exported_at || version.delivery_state === "exported" || version.delivery_state === "published" ? "delivered" : "approved"
  }
  if (version.approval_state === "draft" || version.approval_state === "changes_requested") return "needsApproval"
  return "draft"
}

/** The approval flow for the latest version, and what changed since the version before it. */
export function ActionProgress({ versions, locale }: { versions: VersionRow[]; locale: PrototypeLocale }) {
  const [latest, previous] = versions
  if (!latest) return null
  const t = copy[locale].ui.diff
  return (
    <section className="action-progress" aria-label={copy[locale].ui.visual.approvalFlow.label}>
      <ApprovalFlow state={approvalStepFor(latest)} locale={locale} />
      {previous && (
        <details className="action-progress-diff">
          <summary>{t.title}</summary>
          <VersionDiff before={previous.body} after={latest.body} beforeNo={previous.version_no} afterNo={latest.version_no} locale={locale} />
        </details>
      )}
    </section>
  )
}
