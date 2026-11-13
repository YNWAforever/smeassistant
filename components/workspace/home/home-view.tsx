import Link from "next/link"
import { ArrowRight, Clock3, FileClock, Sparkles } from "lucide-react"
import type { ReactNode } from "react"

import { PageHeader } from "@/components/kinnso/page-header"
import { FactType } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LocationSelect } from "@/components/workspace/location-select"
import { TemplateIcon } from "@/components/workspace/template-icon"
import type { PrototypeLocale } from "@/lib/copy"
import { homeCopyV2 } from "@/lib/copy-home-v2"
import { resolveText } from "@/lib/domain"
import type { ActionOverview } from "@/lib/workspace/overview"
import { effortLabel, formatDateTime, priorityClass, priorityLabel, withLocation } from "@/lib/workspace/format"
import type { HomeBrief } from "@/lib/workspace/queries-pages"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"

/**
 * Owner Home v2: one next step, the drafts waiting for confirmation, one Kinnso
 * entry and an effort-only month strip. Performance, proof and evidence live in
 * Results; integration health and photos live in Business. Nothing here invents
 * a score or combines locations.
 */
export function HomeView({
  locale,
  workspaceSlug,
  timezone,
  locations,
  brief,
  role,
  problems,
  followUps,
  gettingStarted,
}: {
  locale: PrototypeLocale
  workspaceSlug: string
  timezone: string
  locations: Array<{ slug: string; name: string }>
  brief: HomeBrief
  role: WorkspaceRole
  problems?: ReactNode
  followUps?: ReactNode
  gettingStarted?: ReactNode
}) {
  const copy = homeCopyV2[locale]
  const base = `/${locale}/owner/${workspaceSlug}`
  const location = brief.locationSlug
  const priority = brief.priority
  const openTotal = brief.openActionCount ?? brief.openActions.length
  const waiting = brief.openActions
    .filter((action) => action.latestVersion?.approvalState === "draft" && action.id !== priority?.id)
    .slice(0, 3)
  const unscanned = priority === null && (locations.length === 0 || (location !== "all" && brief.snapshot === null))
  const allLocations = location === "all" && priority === null && !unscanned

  const hrefFor = (action: ActionOverview, versionId?: string) =>
    action.templateKey === "google-reconnect"
      ? withLocation(`${base}/business/integrations`, location)
      : withLocation(`${base}/actions/${encodeURIComponent(action.id)}${versionId ? `?version=${encodeURIComponent(versionId)}` : ""}`, location)
  const primaryHref = priority?.latestVersion ? hrefFor(priority, priority.latestVersion.id) : priority ? hrefFor(priority) : null
  const primaryLabel = role === "viewer"
    ? copy.view
    : priority?.latestVersion?.approvalState === "draft"
      ? copy.review
      : copy.open
  const conversationHref = withLocation(`${base}/conversation`, location)
  const askHref = (ask: "write_ig" | "reply_reviews" | "plan_week") => `${conversationHref}${conversationHref.includes("?") ? "&" : "?"}ask=${ask}`

  return (
    <div className="home-v2">
      <PageHeader
        title={copy.title}
        description={copy.lead}
        actions={<LocationSelect locale={locale} value={location} locations={locations} className="location-select" ariaLabel={copy.chooseLocation} />}
      />
      {role === "viewer" && <p className="home-v2-viewer-note">{copy.viewerNote}</p>}
      {problems}

      {priority && (
        <section className="home-v2-next" aria-labelledby="home-v2-next-title">
          <p className="home-v2-eyebrow">{copy.nextStep}</p>
          <div className="home-v2-next-head">
            <TemplateIcon templateKey={priority.templateKey} size="lg" />
            <h2 id="home-v2-next-title">{resolveText(priority.title, locale)}</h2>
          </div>
          <p className="home-v2-next-body">{resolveText(priority.summary, locale)}</p>
          {brief.priorityPreview && <blockquote className="home-v2-preview">{brief.priorityPreview}</blockquote>}
          <div className="home-v2-next-meta">
            <Badge className={priorityClass(priority.priority)}>{priorityLabel(priority.priority, locale)}</Badge>
            <span><Clock3 aria-hidden="true" /> {effortLabel(priority.effortMinutes, locale)}</span>
            <span><FileClock aria-hidden="true" /> {resolveText(priority.displayPhase, locale)}</span>
          </div>
          <div className="home-v2-next-actions">
            {primaryHref && <Button asChild size="lg"><Link href={primaryHref}>{primaryLabel}<ArrowRight aria-hidden="true" /></Link></Button>}
            <details className="home-v2-why">
              <summary>{copy.whyThis}</summary>
              <div>
                <p>{copy.whyThisBody}</p>
                <p><FactType type={priority.evidence.factType} /> {priority.evidence.factType === "Observed" ? copy.observed : ""}{priority.evidence.source ? ` ${priority.evidence.source}` : ""} · {formatDateTime(priority.evidence.observedAt, locale, timezone)}</p>
                {resolveText(priority.evidence.detail, locale) && <p>{resolveText(priority.evidence.detail, locale)}</p>}
                <p><FactType type="Unknown" /> {copy.evidenceLimit}</p>
              </div>
            </details>
          </div>
        </section>
      )}

      {!priority && (
        <section className="home-v2-next home-v2-next--empty" aria-labelledby="home-v2-empty-title">
          <p className="home-v2-eyebrow">{copy.nextStep}</p>
          <h2 id="home-v2-empty-title">{unscanned ? copy.noScanTitle : allLocations ? copy.allLocationsTitle : copy.quietTitle}</h2>
          <p className="home-v2-next-body">{unscanned ? copy.noScanBody : allLocations ? copy.allLocationsBody : copy.quietBody}</p>
          <div className="home-v2-next-actions">
            {unscanned && !allLocations
              ? <Button asChild size="lg"><Link href={`/${locale}/scan`}>{copy.noScanCta}<ArrowRight aria-hidden="true" /></Link></Button>
              : <Button asChild size="lg"><Link href={withLocation(`${base}/actions/new`, location)}>{copy.quietCta}<ArrowRight aria-hidden="true" /></Link></Button>}
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <section className="home-v2-waiting" aria-labelledby="home-v2-waiting-title">
          <div className="home-v2-section-head">
            <div>
              <h2 id="home-v2-waiting-title">{copy.waiting}</h2>
              <p>{copy.waitingLead}</p>
            </div>
            <Link href={withLocation(`${base}/actions`, location)}>{copy.seeAllTasks}<ArrowRight aria-hidden="true" /></Link>
          </div>
          <ul>
            {waiting.map((action) => (
              <li key={action.id}>
                <div>
                  <strong>{resolveText(action.title, locale)}</strong>
                  {action.latestVersion && <small>{`v${action.latestVersion.versionNo}`}</small>}
                </div>
                <Link href={hrefFor(action, action.latestVersion?.id)}>{copy.review}<ArrowRight aria-hidden="true" /></Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-v2-ask" aria-labelledby="home-v2-ask-title">
        <Sparkles aria-hidden="true" />
        <div>
          <h2 id="home-v2-ask-title">{copy.askTitle}</h2>
          <p>{copy.askBody}</p>
        </div>
        <Link className="home-v2-ask-input" href={conversationHref}>
          <span>{copy.askPlaceholder}</span>
          <strong>{copy.askCta}<ArrowRight aria-hidden="true" /></strong>
        </Link>
        <div className="home-v2-ask-suggestions">
          <Link href={askHref("write_ig")}>{copy.askIg}</Link>
          <Link href={askHref("reply_reviews")}>{copy.askReply}</Link>
          <Link href={askHref("plan_week")}>{copy.askPlan}</Link>
        </div>
      </section>

      <section className="home-v2-month" aria-labelledby="home-v2-month-title">
        <h2 id="home-v2-month-title">{copy.month}</h2>
        <dl>
          <div><dt>{copy.completed}</dt><dd>{brief.month.completed}</dd></div>
          <div><dt>{copy.waitingCount}</dt><dd>{brief.month.awaitingApproval}</dd></div>
          <div><dt>{copy.openCount}</dt><dd>{openTotal}</dd></div>
        </dl>
        <Link href={withLocation(`${base}/insights`, location)}>{copy.results}<ArrowRight aria-hidden="true" /></Link>
      </section>

      {followUps}

      {gettingStarted}
    </div>
  )
}
