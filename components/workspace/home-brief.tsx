import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowRight, CalendarClock, Check, CheckCircle2, CircleAlert, CircleCheck, Clock3, FileClock, Globe2, ShieldCheck, Sparkles, TrendingDown } from "lucide-react"

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-launcher"
import { CapabilityBadge, FactType, PageIntro, ScoreDial, SectionCard, TrendIcon } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EvidenceGallery } from "@/components/workspace/evidence-gallery"
import { LocationSelect } from "@/components/workspace/location-select"
import { RescanButton } from "@/components/workspace/rescan-button"
import { TemplateIcon } from "@/components/workspace/template-icon"
import { copy, homeReviewCopy, type PrototypeLocale } from "@/lib/copy"
import { ownerCheckNextStep } from "@/lib/workspace/owner-review-check"
import { resolveText } from "@/lib/domain"
import { basisLabel, comparisonReasonText, effortLabel, findingLabel, formatDateTime, formatDay, metricLabel, ordinal, priorityClass, priorityLabel, scorePercent, signed, withLocation } from "@/lib/workspace/format"
import { measuredPrimarySources } from "@/lib/workspace/module-states"
import type { HomeBrief } from "@/lib/workspace/queries-pages"
import type { ActionOverview } from "@/lib/workspace/overview"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import type { EvidenceGalleryItem } from "@/lib/report/view-model"
import { sourceLabel } from "@/lib/workspace/source-label"
import { fill } from "@/lib/copy-ui"

/** Phase 6 adds `evidence` to the brief (Stream A); read defensively so the page renders either way. */
type HomeBriefWithEvidence = HomeBrief & { evidence?: EvidenceGalleryItem[] | null }

export interface HomeBriefViewProps {
  locale: PrototypeLocale
  workspaceSlug: string
  workspaceId: string
  workspaceName: string
  tier: "lite" | "paid"
  timezone: string
  locations: Array<{ slug: string; name: string }>
  brief: HomeBriefWithEvidence
  demo?: boolean
  /** Server-resolved; see RescanButton for why it cannot be computed client-side. */
  consentPolicyVersion: string
  /** The signed-in member's real role; drives the Rescan button (hidden for viewers). Omitted = no rescan control. */
  role?: WorkspaceRole
  /** NeedsAttentionCard, after the coach card so its <h2> never precedes this page's <h1>. */
  problems?: ReactNode
  /** The getting-started checklist, rendered after today's priority so it never pushes it below the fold. */
  gettingStarted?: ReactNode
  /** "Your month": effort ring, streak, sources, badges (TodayProgress), after the coach card. */
  progressPanel?: ReactNode
  /** The shop's photos (ShopPhotoStrip), after the follow-on rows. */
  photoStrip?: ReactNode
}

function actionHref(locale: PrototypeLocale, slug: string, action: ActionOverview, location: string): string {
  const base = `/${locale}/owner/${slug}`
  const href = action.templateKey === "google-reconnect" ? `${base}/business/integrations` : `${base}/actions/${action.id}`
  return withLocation(action.templateKey !== "google-reconnect" && action.latestVersion
    ? `${href}?version=${encodeURIComponent(action.latestVersion.id)}` : href, location)
}

export function HomeBriefView({ locale, workspaceSlug, workspaceId, tier, timezone, locations, brief, demo = false, role, consentPolicyVersion, problems, gettingStarted, progressPanel, photoStrip }: HomeBriefViewProps) {
  const t = copy[locale].home
  const focus = copy[locale].ownerFocus
  const pc = copy[locale].workspaceHome.home
  const base = `/${locale}/owner/${workspaceSlug}`
  const location = brief.locationSlug
  const { snapshot, changed, priority, proof, month } = brief
  const followUp = brief.reviewFollowUp?.workspaceId === workspaceId ? brief.reviewFollowUp : null
  const reviewText = homeReviewCopy[locale]
  const versionLabel = (n: number) => reviewText.version.replace("{n}", String(n))
  const followUpHref = (versionId: string) => withLocation(`${base}/actions/${encodeURIComponent(followUp!.actionId)}?version=${encodeURIComponent(versionId)}`, location)
  const followUpStatus = followUp?.currentCheck ? ({
    checked: reviewText.checked, not_found: reviewText.notFound, later: reviewText.later, retracted: reviewText.retracted,
  })[followUp.currentCheck.decision] : reviewText.pending
  const sources = snapshot ? measuredPrimarySources(snapshot.moduleStates) : null
  const tierLabel = tier === "paid" ? pc.growthWorkspace : pc.freePlan
  const decisions = brief.agentStrip.awaiting
  const steps = [pc.steps.scout, pc.steps.priority, fill(pc.steps.drafts, { drafts: brief.drafts }), pc.steps.awaiting]
  const stepDone = [brief.agentStrip.scout, brief.agentStrip.priority, brief.drafts > 0, false]
  // Mirrors RescanButton: only a paid owner or manager has the control the empty state would point at.
  const canRescan = tier === "paid" && (role === "owner" || role === "manager")
  const changedBadge = changed.comparable ? pc.comparable : pc.notComparable
  const changedReason = changed.comparable ? null : comparisonReasonText(changed.reason, locale)
  // F-19: never promise ready work that does not exist. No linked business, or
  // one location with no snapshot, means nothing has been scanned yet. The
  // all-locations view never has a snapshot (no aggregate score), so it only
  // falls back to the quiet copy when nothing is open.
  const hasLocations = locations.length > 0
  // "Other" tasks: the open total minus the one already shown above it.
  const openTotal = brief.openActionCount ?? brief.openActions.length
  const otherTasks = Math.max(0, openTotal - (priority ? 1 : 0))
  // An open action is real work whatever the snapshot state, so it always wins.
  const unscanned = !priority && (!hasLocations || (location !== "all" && !snapshot))
  const pageTitle = priority || followUp ? t.title : unscanned ? t.noScanTitle : t.quietTitle
  const pageSubtitle = priority || followUp ? t.subtitle : unscanned ? t.noScanSubtitle : t.quietSubtitle
  const resultCopy = copy[locale].workspaceHome.insights
  const resolved = changed.comparable ? brief.ledger.resolved.length : 0
  const regressed = changed.comparable ? brief.ledger.regressed.length : 0
  const resultSentence = location === "all" ? resultCopy.allLead
    : !snapshot ? resultCopy.missingFirst
    : resolved > 0 && regressed === 0 ? fill(resultCopy.betterResolved, { n: resolved })
    : regressed > 0 && resolved === 0 ? fill(resultCopy.worseRegressed, { n: regressed })
    : resolved > 0 && regressed > 0 ? fill(resultCopy.mixed, { resolved, regressed })
    : changed.comparable && changed.delta !== null ? changed.delta > 0 ? resultCopy.better : changed.delta < 0 ? resultCopy.worse : resultCopy.same
    : changed.reason ? fill(resultCopy.missingBecause, { reason: comparisonReasonText(changed.reason, locale) }) : resultCopy.missingFirst
  const priorityCta = role === "viewer" ? focus.view
    : priority?.templateKey === "google-reconnect" ? focus.connect
    : priority?.missingInputs.length ? t.addFacts
    : priority?.latestVersion?.approvalState === "approved"
      ? ((role === "owner" || role === "manager") && priority.latestVersion.deliveryState === "export_ready" ? focus.export : focus.view)
    : priority?.latestVersion ? focus.review : t.start

  return (
    <div className="owner-home-page owner-daily-focus">
      <PageIntro
        eyebrow={priority || followUp ? undefined : snapshot ? `${pc.snapshot} · ${formatDateTime(snapshot.observedAt, locale, timezone)}` : hasLocations && location === "all" ? pc.allLocationsNoCombined : pc.noSnapshotYet}
        title={pageTitle}
        description={priority || followUp ? undefined : pageSubtitle}
        actions={<LocationSelect locale={locale} value={location} locations={locations} />}
      />

      {!hasLocations && <div className="context-banner" role="status"><CircleAlert /><div><strong>{t.noLocationTitle}</strong><span>{t.noLocationBody}</span><Link href={`/${locale}/scan`}>{t.noLocationCta}</Link></div></div>}

      <section className="owner-brief-grid" aria-label={pc.todaySOperatingBrief}>
        {(priority || !followUp) && <article className="brief-priority-card">
          {priority ? (
            <>
              <div className="brief-priority-head"><TemplateIcon templateKey={priority.templateKey} size="lg" /><h2>{resolveText(priority.title, locale)}</h2></div>
              <p className="coach-sentence">{resolveText(priority.summary, locale)}</p>
              {brief.priorityPreview && <blockquote className="brief-draft-preview" data-testid="home-draft-preview">{brief.priorityPreview}</blockquote>}
              <div className="brief-priority-actions"><Button asChild size="lg"><Link href={actionHref(locale, workspaceSlug, priority, location)}>{priorityCta}<ArrowRight /></Link></Button></div>
            </>
          ) : followUp ? null : (
            <>
              <h2>{pc.noActionNeedsYour}</h2>
              <p className="coach-sentence">{snapshot ? (canRescan ? `${t.emptyWeek} ${t.rescanNow}` : t.emptyWeek) : pc.actionsAreDerivedFrom}</p>
            </>
          )}
        </article>}
        {followUp && <article className="brief-priority-card" data-testid="home-review-followup" aria-label={reviewText.title}>
          <div className="card-label-row"><span><FileClock /> {reviewText.title}</span><Badge variant="outline">{reviewText.completed}</Badge></div>
          <h2>{resolveText(followUp.title, locale)}</h2>
          <p className="brief-action-meta">{versionLabel(followUp.versionNo)} · {reviewText.applied}</p>
          <p data-testid="home-owner-check-status">{followUpStatus}</p>
          <p>{reviewText.next} {followUp.currentCheck
            ? resolveText(ownerCheckNextStep(followUp.currentCheck.decision), locale) : reviewText.compare}</p>
          <p className="limitation-note">{reviewText.independent}</p>
          <div className="brief-priority-actions"><Button asChild variant={priority ? "outline" : "default"} size={priority ? "default" : "lg"}><Link data-next-check
            href={followUpHref(followUp.versionId)} prefetch={false}>{followUp.canRecord && role !== "viewer" && followUp.currentCheck?.decision !== "checked" ? reviewText.check : reviewText.view}<ArrowRight /></Link></Button></div>
          {followUp.newerDraft && <div className="mt-4 border-t pt-3">
            <p>{reviewText.newerDraft.replace("{n}", String(followUp.newerDraft.versionNo)).replace("{applied}", String(followUp.versionNo))}</p>
            <Link data-newer-draft href={followUpHref(followUp.newerDraft.id)} prefetch={false}>
              {reviewText.reviewDraft.replace("{n}", String(followUp.newerDraft.versionNo))}<ArrowRight className="inline size-4" />
            </Link>
          </div>}
        </article>}
      </section>

      {!priority && !followUp && openTotal === 0 && gettingStarted}

      {problems}

      {progressPanel}

      <section className="owner-results-disclosure" aria-label={focus.results}>
        <p>{resultSentence}</p>
        <Link href={withLocation(`${base}/insights`, location)}>{focus.results}<ArrowRight /></Link>
      </section>

      {otherTasks > 0 && <section className="owner-tasks-disclosure" aria-label={focus.otherTasks}>
        <p>{focus.otherTasks} <Badge variant="outline">{otherTasks}</Badge></p>
        <Link href={withLocation(`${base}/actions`, location)}>{focus.allTasks}<ArrowRight /></Link>
      </section>}

      {photoStrip}

      {/* Scores and supporting records stay available without competing with the coach. */}
      <details className="trust-disclosure owner-priority-evidence">
        <summary><ShieldCheck /> {t.trust}</summary>
      {priority && <>
        <div className="brief-action-meta"><Badge className={priorityClass(priority.priority)}>{priorityLabel(priority.priority, locale)}</Badge><span><Clock3 /> {effortLabel(priority.effortMinutes, locale)} {pc.ownerTime}</span><span><FileClock /> {resolveText(priority.displayPhase, locale)}</span>{priority.latestVersion && <span>{versionLabel(priority.latestVersion.versionNo)}</span>}</div>
        <div className="why-now-box"><FactType type={priority.evidence.factType} /><div><strong>{t.whyNow}</strong><span>{resolveText(priority.evidence.detail, locale)}</span><small>{pc.observed} {formatDateTime(priority.evidence.observedAt, locale, timezone)} · {sourceLabel(priority.evidence.source, locale)}</small></div></div>
        <ContextualAssistant locale={locale} surface="home" triggerLabel={pc.askWhyThisComes} autoAsk="explain_priority" mode="live" context={{ workspaceId, locationId: brief.location?.id, snapshotId: snapshot?.id }} basePath={base} locationParam={location} />
      </>}

        {hasLocations && location === "all" && <div className="context-banner" role="status"><CircleAlert /><div><strong>{pc.contextChangedToAll}</strong><span>{pc.summaryDataIsLocation}</span></div></div>}
        {role && <div className="owner-results-tools"><RescanButton locale={locale} workspaceId={workspaceId} workspaceSlug={workspaceSlug} locationId={brief.location?.id ?? null} tier={tier} role={role} consentPolicyVersion={consentPolicyVersion} /></div>}
        <div className="owner-results-grid">

        <article className="brief-score-card">
          <div className="card-label-row"><span><TrendIcon delta={changed.comparable ? changed.delta : null} /> {t.changed}</span><Badge variant="outline">{changedBadge}</Badge></div>
          {!snapshot ? (
            <div className="aggregate-empty"><CircleAlert /><h2>{location === "all" ? pc.noFabricatedAggregateScore : pc.noSnapshotYet}</h2><p>{location === "all" ? pc.coverageAndEligibilityDiffer : pc.scoreAndCoverageAppear}</p></div>
          ) : snapshot.overallScore === null ? (
            <div className="aggregate-empty"><CircleAlert /><h2>{pc.scoreWithheldTooLittle}</h2><p>{fill(pc.coverageMissingSourcesLower, { coverage: String(scorePercent(snapshot.coverage)) })}</p></div>
          ) : (
            <>
              {/* delta is spread, never coerced: a null delta means there is no
                  comparable scan, and passing 0 made the largest number on the
                  page assert "unchanged since comparable scan" -- in the
                  sighted UI and the aria-label -- next to a "Not comparable"
                  badge. Same pattern the report page already uses. */}
              <ScoreDial score={Math.round(snapshot.overallScore)} coverage={scorePercent(snapshot.coverage)} {...(changed.comparable && changed.delta !== null ? { delta: Math.round(changed.delta) } : {})} />
              {/* Only when the source counts are known; never invent "0 measured". */}
              {sources && <div className="coverage-source-line"><span><Check /> {fill(pc.measured, { measured: sources.measured })}</span><span><CircleAlert /> {fill(pc.unavailable, { measured: sources.total - sources.measured })}</span></div>}
              {changedReason && <p className="limitation-note">{changedReason}</p>}
            </>
          )}
          <Link href={withLocation(`${base}/insights`, location)}>{pc.reviewComparableEvidence} <ArrowRight /></Link>
        </article>

        <article className="brief-proof-card">
          <div className="card-label-row"><span><CircleCheck /> {t.proof}</span><Badge variant="outline">{proof ? (proof.factType === "Attributed" ? pc.observedAfterAction : pc.comparableChange) : pc.nothingMeasuredYet}</Badge></div>
          {proof ? (
            <>
              <div className="proof-value"><TrendIcon delta={proof.delta} /><strong>{signed(proof.delta, 1)}<span> {pc.change}</span></strong></div>
              <h2>{metricLabel(proof.metricKey, locale)}</h2>
              <p>{fill(pc.proofMeasured, { before: proof.before ?? "—", after: proof.after ?? "—", observedAt: formatDay(proof.observedAt, locale, timezone) })}{proof.windowDays ? (fill(pc.dayWindow, { windowDays: proof.windowDays })) : ""}</p>
              <div className="proof-caveat"><FactType type={proof.factType} /><span>{proof.factType === "Attributed" ? `${basisLabel(proof.attributionBasis, locale)} · ${pc.temporalAssociationOnlyNo}` : pc.observedDifferenceBetweenTwo}</span></div>
            </>
          ) : (
            <>
              <h2>{pc.proofAppearsAfterAn}</h2>
              <p>{pc.theWorkspaceOnlyCites}</p>
            </>
          )}
          <Link href={withLocation(`${base}/insights`, location)}>{pc.inspectBeforeAndAfter} <ArrowRight /></Link>
        </article>
        </div>

      <section className="month-brief" aria-labelledby="month-title">
        <div className="month-brief-heading"><div><p className="eyebrow">{t.month}</p><h2 id="month-title">{pc.smallActionsVisibleMomentum}</h2></div>{/* A cadence you act on, not a booked run: nothing dispatches a due
    `scan_schedules` row, so "Next scan · <date>" promised a scan that
    would never happen -- and since `next_run_at` is never advanced, that
    date silently became one in the past. The recurring day stays true. */}
<div className="next-scan"><CalendarClock /><span>{pc.rescanCadence}<strong>{brief.rescanCadenceDay ? fill(pc.monthlyOn, { day: brief.rescanCadenceDay, ordinal: ordinal(brief.rescanCadenceDay) }) : pc.noneYet}</strong></span></div></div>
        <div className="month-metrics">
          <article><span className="metric-icon resolved"><CheckCircle2 /></span><div><strong>{month.resolved ?? "—"}</strong><span>{pc.issuesResolved}</span></div><small>{month.resolved === null ? t.noComparable : pc.acrossComparableScans}</small></article>
          <article><span className="metric-icon regressed"><TrendingDown /></span><div><strong>{month.regressed ?? "—"}</strong><span>{month.regressed === 1 ? pc.newRegression : pc.newRegressions}</span></div><small>{month.regressed === null ? t.noComparable : brief.ledger.regressed[0] ? findingLabel(brief.ledger.regressed[0], locale) : pc.noneRecorded}</small></article>
          <article><span className="metric-icon approval"><FileClock /></span><div><strong>{month.awaitingApproval}</strong><span>{pc.awaitingApproval}</span></div><small>{pc.draftVersions}</small></article>
          <article><span className="metric-icon completed"><CircleCheck /></span><div><strong>{month.completed}</strong><span>{pc.actionsCompleted}</span></div><small>{fill(pc.measuredCount, { measured: month.measured })}</small></article>
        </div>
      </section>
        <p className="owner-approval-note">{focus.approvalNote}</p>
        <section className="workspace-agent-strip" aria-label={pc.aiVisibilityTeamStatus}>
          <div className="workspace-agent-summary"><span><Sparkles /></span><div><Badge variant="outline">{tierLabel}{demo ? pc.demo : ""}</Badge><h2>{unscanned ? pc.aiVisibilityTeamIs : fill(decisions === 1 ? pc.teamFinishedOne : pc.teamFinishedMany, { decisions })}</h2><p>{pc.specialistsCoordinateBackstageYou}</p></div></div>
          <ol>
            {steps.map((step, index) => <li key={step} className={stepDone[index] ? "is-complete" : "is-current"}><span>{stepDone[index] ? <Check /> : index + 1}</span><strong>{step}</strong></li>)}
          </ol>
          <small><ShieldCheck /> {pc.neverAutoPublishedOne}</small>
        </section>

          <SectionCard className="integration-health-card">
            <div className="section-card-heading"><div><p className="eyebrow">{pc.sourceReliability}</p><h2>{pc.integrationHealth}</h2></div><Button asChild variant="ghost"><Link href={`${base}/business/integrations`}>{pc.manage}</Link></Button></div>
            <div className="integration-compact-list">
              {[
                { name: pc.googleBusinessProfile, ok: brief.integrations.google.status === "active", warn: brief.integrations.google.status !== "active", note: brief.integrations.google.status === "active" ? pc.connected : (copy[locale].workspace.phases.requires_connection) },
                { name: pc.instagramPublicEvidence, ok: brief.integrations.instagram.state === "measured", warn: false, note: copy[locale].common[brief.integrations.instagram.state === "unknown" ? "unavailable" : brief.integrations.instagram.state] },
                { name: pc.publicWebsite, ok: brief.integrations.website.state === "measured", warn: false, note: copy[locale].common[brief.integrations.website.state === "unknown" ? "unavailable" : brief.integrations.website.state] },
              ].map((row) => <div key={row.name}><span className={row.ok ? "health-ok" : row.warn ? "health-warn" : "health-neutral"}>{row.ok ? <Check /> : row.warn ? <CircleAlert /> : <Globe2 />}</span><div><strong>{row.name}</strong><small>{row.note}</small></div></div>)}
            </div>
          </SectionCard>

        <SectionCard className="change-ledger-card">
          <div className="section-card-heading"><div><p className="eyebrow">{pc.recentChangeLedger}</p><h2>{pc.evidenceBeforeCharts}</h2></div><Badge variant="outline">{snapshot ? `${formatDay(snapshot.observedAt, locale, timezone)}${changed.comparable ? pc.comparableScan : ""}` : pc.noScanYet}</Badge></div>
          <div className="change-ledger">
            {brief.ledger.regressed.map((key) => <article key={`r-${key}`}><FactType type="Observed" /><div><h3>{findingLabel(key, locale)}</h3><p>{pc.regressedInTheLatest}</p><small>{pc.regressed}</small></div><Button asChild variant="outline" size="sm"><Link href={withLocation(`${base}/actions`, location)}>{pc.actNow}</Link></Button></article>)}
            {brief.ledger.resolved.map((key) => <article key={`s-${key}`}><FactType type="Observed" /><div><h3>{findingLabel(key, locale)}</h3><p>{pc.resolvedInTheLatest}</p><small>{pc.resolved}</small></div><Button asChild variant="outline" size="sm"><Link href={withLocation(`${base}/insights`, location)}>{pc.viewProof}</Link></Button></article>)}
            {brief.ledger.decayed.map((key) => <article key={`d-${key}`}><FactType type="Observed" /><div><h3>{findingLabel(key, locale)}</h3><p>{pc.timeDrivenChangeNot}</p><small>{pc.decayed}</small></div></article>)}
            {!changed.comparable && <article><FactType type="Unknown" /><div><h3>{pc.comparisonUnavailable}</h3><p>{changedReason ?? pc.twoEligibleScansAre}</p><small>{pc.coverageGapNotScored}</small></div><Button asChild variant="outline" size="sm"><Link href={`${base}/business/integrations`}>{pc.checkSource}</Link></Button></article>}
          </div>
        </SectionCard>

        <EvidenceGallery locale={locale} items={brief.evidence} />

        <div className="operational-footnote"><ShieldCheck /><span>{pc.everyNumberComesFrom}</span>{demo && <CapabilityBadge value="Demo" />}</div>
      </details>
    </div>
  )
}
