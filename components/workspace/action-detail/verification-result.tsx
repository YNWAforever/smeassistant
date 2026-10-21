import Link from "next/link"

import { FactType, SectionCard } from "@/components/product-ui"
import { formatDateTime, withLocation } from "@/lib/workspace/format"
import { OwnerReviewCheckPanel } from "@/components/workspace/owner-review-check-panel"
import type { ActionEditor } from "@/components/workspace/action-detail/use-action-editor"

/** The follow-up link and, once the action is out in the world, what the next check verified (and what it cannot). */
export function VerificationResult({ ed }: { ed: ActionEditor }) {
  const {
    action, applied, approvedAssets, base, canEdit, conflict, dirty, locale, location, locationName, offline, ownerCheck,
    ownerCheckIdentity, reviewEvidence, router, selectedVersion, showVerification, timezone, verification, verificationCopy,
    verificationNext, versions, workspaceId
  } = ed
  return (
    <>
      {action.evidence.followUpOfActionId && <p className="action-follow-up"><Link href={withLocation(`${base}/actions/${action.evidence.followUpOfActionId}`, location)}>{verificationCopy.followUp}</Link></p>}
      {showVerification && <SectionCard className="action-verification-result">
        <div className="section-card-heading"><div><p className="eyebrow">{verificationCopy.heading}</p><h2>{verificationCopy.outcomes[verification.outcome]}</h2></div><FactType type={verification.outcome === "verified" ? "Observed" : "Unknown"} /></div>
        {verification.unsupported && <p>{verificationCopy.unsupportedReview}</p>}
        {verification.outcome !== "verified" && <p>{verificationCopy.unknown}</p>}
        <dl className="evidence-detail-dl">
          <div><dt>{verificationCopy.source}</dt><dd>{verification.sourceUrl ? <a className="break-all" href={verification.sourceUrl} target="_blank" rel="noopener noreferrer">{verification.sourceUrl}</a> : verificationCopy.noSource}</dd></div>
          <div><dt>{verificationCopy.checkedAt}</dt><dd>{verification.checkedAt ? formatDateTime(verification.checkedAt, locale, timezone) : verificationCopy.noCheck}</dd></div>
        </dl>
        <p>{verificationNext}</p><p>{verificationCopy.businessResults}</p>
        {action.templateKey === "review-response" && (applied || ownerCheck.records.length > 0) && selectedVersion && <OwnerReviewCheckPanel
          locale={locale} workspaceId={workspaceId} actionId={action.id} version={selectedVersion}
          latestVersionId={versions[0].id} identity={ownerCheckIdentity ?? locationName}
          timezone={timezone} mapsUrl={reviewEvidence?.mapsUrl ?? null} context={ownerCheck}
          approvedAssets={approvedAssets} canEdit={canEdit} offline={offline} dirty={dirty || conflict}
          onSaved={() => router.refresh()} onReload={() => router.refresh()}
          returnHomeHref={withLocation(base, location)}
        />}
      </SectionCard>}
    </>
  )
}
