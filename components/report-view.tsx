import Link from "next/link"
import { ArrowRight, Check, CircleAlert, ImageOff, LockKeyhole, MessageCircle, TriangleAlert } from "lucide-react"

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet"
import {
  DemoBadge,
  FactType,
  LoopRibbon,
  ProviderBadge,
  PublicPageFrame,
  ScoreDial,
  SectionCard,
} from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { copy } from "@/lib/copy"
import type { ReportEvidenceItem, ReportProofData, ReportProps } from "@/lib/funnel/report-props"
import { interpolate } from "@/lib/share"

/**
 * The report renders entirely from ReportProps (lib/funnel/report-props.ts):
 * the public preview, the unlocked viewer/member model and /sample-report all
 * take the same shape, so nothing here reads lib/demo-data or the database.
 * No hooks — the route segment renders this on the server.
 */

function isoDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10)
}

function ProofRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="trust-dl">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ProofPanels({ proof, locale }: { proof: ReportProofData; locale: ReportProps["locale"] }) {
  const c = copy[locale].funnel.report
  const p = c.proof
  const yesNo = (value: boolean | null | undefined) => (value == null ? p.unknown : value ? p.yes : p.no)
  const panels: Array<{ key: string; title: string; rows: Array<[string, string]>; extra?: React.ReactNode }> = []

  if (proof.ig) {
    const ig = proof.ig
    panels.push({
      key: "ig",
      title: p.ig,
      rows: [
        [p.followers, String(ig.followers)],
        [p.following, String(ig.following)],
        [p.posts, String(ig.postsCount)],
      ],
      extra: ig.bio ? <p className="proof-caveat">{ig.bio}</p> : null,
    })
  }
  if (proof.gbp) {
    const gbp = proof.gbp
    panels.push({
      key: "gbp",
      title: p.gbp,
      rows: [
        [p.rating, String(gbp.rating)],
        [p.reviews, String(gbp.reviewsCount)],
      ],
      extra: gbp.recentReviews.length ? (
        <ul className="evidence-list">
          {gbp.recentReviews.slice(0, 3).map((review, index) => (
            <li key={`${review.time}-${index}`}>
              <Badge variant="outline">{review.rating} ★</Badge>
              <span>
                <strong>{review.text}</strong>
                <small>{review.ownerResponse ? p.ownerReply : p.noReply}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : null,
    })
  }
  if (proof.aeo) {
    const aeo = proof.aeo
    const site = aeo.website
    panels.push({
      key: "aeo",
      title: p.aeo,
      rows: site
        ? [
            [p.website, site.url],
            [p.faqSchema, yesNo(site.hasFaqSchema)],
            [p.metaLength, String(site.metaDescriptionLength)],
            [p.h1Count, String(site.h1Count)],
          ]
        : [],
      extra: aeo.runs.length ? (
        <ul className="evidence-list">
          {aeo.runs.slice(0, 4).map((run) => (
            <li key={run.query}>
              <FactType type="Observed" />
              <span>
                <strong>{run.query}</strong>
                <small>{`${p.overview}: ${yesNo(run.aiOverviewMentioned)} · ${p.mode}: ${yesNo(run.aiModeMentioned)} · ${p.organic}: ${run.organicRank ?? p.unknown}`}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : null,
    })
  }
  if (proof.merchant) {
    const runs = proof.merchant.runs
    panels.push({
      key: "merchant",
      title: p.merchant,
      rows: [],
      extra: runs.length ? (
        <ul className="evidence-list">
          {runs.slice(0, 4).map((run, index) => (
            <li key={`${run.query}-${index}`}>
              <FactType type="Observed" />
              <span>
                <strong>{run.query}</strong>
                <small>{`${p.found}: ${yesNo(run.found)} · ${p.cited}: ${yesNo(run.aiCited)} · ${p.organic}: ${run.organicRank ?? p.unknown} · ${p.competitors}: ${run.competitors.length}`}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : null,
    })
  }
  if (proof.trust) {
    const trust = proof.trust
    panels.push({
      key: "trust",
      title: p.trust,
      rows: [
        [p.reviews, trust.reviews == null ? p.unknown : String(trust.reviews)],
        [p.rating, trust.rating == null ? p.unknown : String(trust.rating)],
        [p.response, trust.responseRate == null ? p.unknown : `${trust.responseRate}%`],
        [p.followers, trust.followers == null ? p.unknown : String(trust.followers)],
        [p.days, trust.daysSinceLastReview == null ? p.unknown : String(trust.daysSinceLastReview)],
      ],
    })
  }

  if (!panels.length) return null

  return (
    <section className="report-section">
      <div className="section-heading-inline">
        <div>
          <p className="eyebrow">{c.proofEyebrow}</p>
          <h2>{c.proofTitle}</h2>
        </div>
      </div>
      <p className="proof-caveat">{c.proofBody}</p>
      <div className="method-layout">
        {panels.map((panel) => (
          <SectionCard key={panel.key}>
            <h3>{panel.title}</h3>
            {panel.rows.length > 0 && <ProofRows rows={panel.rows} />}
            {panel.extra}
          </SectionCard>
        ))}
      </div>
    </section>
  )
}

function EvidenceGallery({ items, locale }: { items: ReportEvidenceItem[]; locale: ReportProps["locale"] }) {
  const c = copy[locale].funnel.report
  if (!items.length) return null
  return (
    <section className="report-section">
      <div className="section-heading-inline">
        <div>
          <p className="eyebrow">{c.evidenceEyebrow}</p>
          <h2>{c.evidenceTitle}</h2>
        </div>
      </div>
      <p className="proof-caveat">{c.evidenceBody}</p>
      <div className="evidence-passport">
        {items.map((item) => (
          <article key={item.id}>
            <div>
              {item.mediaUrl ? (
                <img src={item.mediaUrl} alt={item.text ?? `${item.provider} ${item.evidenceType}`} loading="lazy" decoding="async" />
              ) : (
                <span className="collector-icon collector-unavailable" aria-hidden="true">
                  <ImageOff />
                </span>
              )}
              <h3>{`${item.provider} · ${item.evidenceType}`}</h3>
              {item.text && <p>{item.text}</p>}
              <small>{interpolate(c.evidenceCaptured, { date: isoDate(item.capturedAt) ?? "" })}</small>
              {item.sourceUrl && (
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                  {c.evidenceSource}
                </a>
              )}
            </div>
            <div className="evidence-passport-value">
              <strong>
                {item.status === "stored" ? c.measuredLabel : item.status === "metadata_only" ? c.evidenceMetadataOnly : c.evidenceFailed}
              </strong>
              {item.limitationCode && <small>{item.limitationCode}</small>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function ReportPage(props: ReportProps) {
  const { locale, access, sample, market, status, score, coverage, comparison, modules, priorities, locked } = props
  const t = copy[locale]
  const c = t.funnel.report
  const failed = status === "failed"
  const partial = status === "partial" || (coverage != null && coverage < 100)
  const measured = modules.filter((module) => module.state === "measured").length
  const unavailable = modules.length - measured
  const marketLabel = market === "tw" ? c.marketTW : c.marketHK
  const subtitle =
    props.subtitle ??
    [marketLabel, props.district, props.industry, comparison.kind === "first_scan" ? c.firstScan : null].filter(Boolean).join(" · ")
  const accessNote = sample ? c.sampleNote : access === "member" ? c.memberNote : access === "viewer" || access === "staff" ? c.viewerNote : null

  return (
    <PublicPageFrame locale={locale} demo={sample}>
      <main className="report-page">
        <div className="report-title-row">
          <div>
            <Badge variant="outline">{sample ? c.sampleBadge : locked ? c.previewBadge : c.fullBadge}</Badge>
            <h1>{interpolate(c.title, { business: props.businessName })}</h1>
            <p>{subtitle}</p>
            {accessNote && <small>{accessNote}</small>}
          </div>
          <div className="report-title-badges">
            {sample && <DemoBadge locale={locale} />}
            {failed && <Badge variant="outline">{c.failedBadge}</Badge>}
            {!failed && partial && <Badge variant="outline">{c.partialBadge}</Badge>}
            {sample && <ContextualAssistant locale={locale} surface="report" />}
          </div>
        </div>

        <LoopRibbon active={sample ? 2 : 1} />

        <section className="report-score-panel">
          {score == null ? (
            <div className="score-dial-wrap">
              <div className="score-dial-core">
                <span className="score-number">{c.notScored}</span>
                {coverage != null && <span className="score-label">{`${coverage}% ${t.common.coverage}`}</span>}
              </div>
            </div>
          ) : (
            <ScoreDial
              score={score}
              coverage={coverage}
              {...(comparison.kind === "comparable" ? { delta: comparison.delta } : {})}
            />
          )}
          <div className="score-explanation">
            <FactType type={score == null ? "Unknown" : "Observed"} />
            <h2>
              {failed
                ? c.failedTitle
                : score == null
                  ? c.withheldTitle
                  : comparison.kind === "comparable"
                    ? comparison.title
                    : comparison.kind === "incomparable"
                      ? c.comparisonLabel
                      : c.firstScanTitle}
            </h2>
            <p>
              {failed
                ? c.failedBody
                : score == null
                  ? c.withheldBody
                  : comparison.kind === "comparable"
                    ? comparison.body
                    : comparison.kind === "incomparable"
                      ? comparison.reason
                      : c.firstScanBody}
            </p>
            <div className="score-meta-grid">
              <div>
                <span>{c.measuredLabel}</span>
                <strong>{interpolate(c.sourceCount, { count: measured })}</strong>
              </div>
              <div>
                <span>{c.unavailableLabel}</span>
                <strong>{interpolate(c.sourceCount, { count: unavailable })}</strong>
              </div>
              <div>
                <span>{c.comparisonLabel}</span>
                <strong>{comparison.kind === "comparable" ? c.comparisonEligible : c.comparisonNotYet}</strong>
              </div>
            </div>
            <Link href={`/${locale}/methodology`}>
              {c.howMeasured} <ArrowRight />
            </Link>
          </div>
        </section>

        <section className="report-section">
          <div className="section-heading-inline">
            <div>
              <p className="eyebrow">{c.prioritiesEyebrow}</p>
              <h2>{c.prioritiesTitle}</h2>
            </div>
            <Badge variant="outline">{c.prioritiesRanked}</Badge>
          </div>
          {priorities.length === 0 ? (
            <div className="limitations-box">
              <CircleAlert />
              <div>
                <p>{c.prioritiesEmpty}</p>
              </div>
            </div>
          ) : (
            <div className="priority-report-grid">
              {priorities.map((priority) => (
                <article key={priority.key}>
                  <div className="priority-rank">{String(priority.rank).padStart(2, "0")}</div>
                  <div className="priority-card-head">
                    <Badge variant="outline" className={`priority-${priority.tone}`}>
                      {priority.severityLabel}
                    </Badge>
                    {priority.overallImpact && <span>{priority.overallImpact}</span>}
                  </div>
                  <h3>{priority.label}</h3>
                  {priority.summary && <p>{priority.summary}</p>}
                  {priority.evidence && (
                    <div className="evidence-excerpt">
                      <FactType type="Observed" />
                      <strong>{priority.evidence.source}</strong>
                      <span>{priority.evidence.excerpt}</span>
                      {priority.evidence.observedAt && <small>{priority.evidence.observedAt}</small>}
                    </div>
                  )}
                  {priority.action && (
                    <div className="recommendation-line">
                      <FactType type="Recommended" />
                      <span>{priority.action}</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="report-section">
          <div className="section-heading-inline">
            <div>
              <p className="eyebrow">{c.passportEyebrow}</p>
              <h2>{c.passportTitle}</h2>
            </div>
            <Link href={`/${locale}/methodology`}>{c.fullMethodology}</Link>
          </div>
          <div className="evidence-passport">
            {modules.map((module) => (
              <article key={module.key}>
                <div>
                  <h3>{module.label}</h3>
                  {module.detail && <p>{module.detail}</p>}
                  {module.observedAt && <small>{module.observedAt}</small>}
                </div>
                <div className="evidence-passport-value">
                  <strong>{module.value}</strong>
                  <ProviderBadge state={module.state} locale={locale} />
                </div>
              </article>
            ))}
          </div>
        </section>

        {locked && (
          <section className="unlock-banner">
            <div>
              <LockKeyhole />
              <div>
                <p className="eyebrow">{c.unlockEyebrow}</p>
                <h2>{c.unlockTitle}</h2>
                <p>{c.unlockBody}</p>
                <small>{interpolate(c.unlockHidden, { count: locked.hiddenFindingCount })}</small>
              </div>
            </div>
            <Button asChild size="lg">
              <Link href={locked.unlockHref}>
                {c.unlockButton} <ArrowRight />
              </Link>
            </Button>
          </section>
        )}

        {props.summary && (
          <section className="report-section">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">{c.summaryEyebrow}</p>
                <h2>{c.summaryTitle}</h2>
              </div>
            </div>
            <SectionCard>
              <FactType type="Inference" />
              <p>{props.summary}</p>
            </SectionCard>
          </section>
        )}

        {!locked && (
          <section className="report-section">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">{c.findingsEyebrow}</p>
                <h2>{c.findingsTitle}</h2>
              </div>
            </div>
            {props.findingGroups.length === 0 ? (
              <div className="limitations-box">
                <TriangleAlert />
                <div>
                  <p>{c.findingsEmpty}</p>
                </div>
              </div>
            ) : (
              props.findingGroups.map((group) => (
                <SectionCard key={group.module}>
                  <h3>{group.label}</h3>
                  <ul className="evidence-list">
                    {group.findings.map((finding) => (
                      <li key={finding.id}>
                        <Badge variant="outline" className={`priority-${finding.tone}`}>
                          {finding.severityLabel}
                        </Badge>
                        <span>
                          <strong>{finding.label}</strong>
                          {finding.message && <small>{finding.message}</small>}
                          {finding.overallImpact && <small>{finding.overallImpact}</small>}
                          {finding.action && (
                            <small>
                              {c.actionLabel}: {finding.action}
                            </small>
                          )}
                          {finding.evidence.length > 0 && (
                            <small>
                              {c.evidenceLabel}: {finding.evidence.map(([key, value]) => `${key}: ${value}`).join(" · ")}
                            </small>
                          )}
                          {finding.fixPackDraft && (
                            <small>
                              {c.draftLabel}: {finding.fixPackDraft}
                            </small>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ))
            )}
          </section>
        )}

        {props.proof && <ProofPanels proof={props.proof} locale={locale} />}
        <EvidenceGallery items={props.evidence} locale={locale} />

        {props.ctas.length > 0 && (
          <SectionCard className="retention-summary">
            <div>
              <MessageCircle />
              <div>
                <p className="eyebrow">{c.ctaEyebrow}</p>
                <h2>{c.ctaTitle}</h2>
                <p>{c.ctaBody}</p>
              </div>
            </div>
            <div className="report-handoff-actions">
              {props.ctas.map((cta) => (
                <Button key={cta.id} asChild variant="outline">
                  <a href={cta.href} target="_blank" rel="noreferrer">
                    <Check aria-hidden="true" />
                    {t.funnel.unlock.channels[cta.channel as keyof typeof t.funnel.unlock.channels] ?? cta.channel}
                  </a>
                </Button>
              ))}
            </div>
          </SectionCard>
        )}
      </main>
    </PublicPageFrame>
  )
}
