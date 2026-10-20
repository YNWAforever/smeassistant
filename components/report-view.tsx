import { ArrowRight, Check, LockKeyhole, MessageCircle, TriangleAlert } from "lucide-react"
import Link from "next/link"

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-launcher"
import { FactType, PublicPageFrame, SectionCard } from "@/components/product-ui"
import { DashboardMetrics } from "@/components/report/dashboard-metrics"
import { DashboardPriorities } from "@/components/report/dashboard-priorities"
import { DashboardSummary } from "@/components/report/dashboard-summary"
import styles from "@/components/report/dashboard.module.css"
import { EvidenceGallery } from "@/components/report/evidence-gallery"
import { FindingsBrowser } from "@/components/report/findings-browser"
import { ProofPanels } from "@/components/report/proof-panels"
import { RecoveryForm } from "@/components/report/recovery-form"
import { Button } from "@/components/ui/button"
import { LoopStepper } from "@/components/visual/steps"
import { copy } from "@/lib/copy"
import { buildReportDashboard } from "@/lib/funnel/report-dashboard"
import type { ReportProps } from "@/lib/funnel/report-props"
import { interpolate } from "@/lib/share"

/**
 * The report renders entirely from ReportProps (lib/funnel/report-props.ts):
 * the public preview, the unlocked viewer/member model and /sample-report all
 * take the same shape, so nothing here reads lib/demo-data or the database.
 *
 * Reading order: score and coverage, "Do this first", the unlock step (locked
 * only), each source, key numbers, evidence photos, every finding, then the
 * supporting detail. Privileged sections render only when unlocked.
 */
export function ReportPage(props: ReportProps) {
  const { locale, sample, locked } = props
  const t = copy[locale]
  const c = t.funnel.report
  const authorized = props.access !== "public" && !locked
  const dashboard = buildReportDashboard(props)
  return (
    <PublicPageFrame
      locale={locale}
      demo={sample}
      // Same condition as the claim hand-off in DashboardSummary: only an unlocked
      // viewer of a real report signs in with this report's claim (F-20).
      signInHref={!sample && props.access === "viewer" && props.slug ? `/${locale}/owner/sign-in?claim=${encodeURIComponent(props.slug)}` : undefined}
    >
      <main className="report-page">
        <DashboardSummary report={props} />
        {/* P4.5: one unsaved AI reply draft. The page sets the href only for an
            unlocked viewer with the flag on; sample reports never carry it. */}
        {props.previewDraftHref && (
          <SectionCard className="retention-summary">
            <div>
              <MessageCircle aria-hidden="true" />
              <div>
                <p className="eyebrow">{t.funnel.preview.badge}</p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href={props.previewDraftHref}>
                {t.funnel.preview.cardTitle} <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </SectionCard>
        )}
        <DashboardPriorities report={props} />

        {locked && (
          <section className="unlock-banner">
            <div>
              <LockKeyhole aria-hidden="true" />
              <div>
                <p className="eyebrow">{c.unlockEyebrow}</p>
                <h2>{c.unlockTitle}</h2>
                <p>{c.unlockBody}</p>
                <small>{locale === "en" && locked.hiddenFindingCount === 1 ? "1 more finding in the full report" : interpolate(c.unlockHidden, { count: locked.hiddenFindingCount })}</small>
              </div>
            </div>
            <Button asChild size="lg">
              <Link href={locked.unlockHref}>
                {c.unlockButton} <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {props.recoveryAvailable && <RecoveryForm locale={locale} slug={props.slug} />}
          </section>
        )}

        <DashboardMetrics report={props} dashboard={dashboard} />
        {authorized && <EvidenceGallery items={props.evidence} locale={locale} timeZone={props.market === "tw" ? "Asia/Taipei" : "Asia/Hong_Kong"} />}

        {authorized && (
          <section className="report-section" aria-labelledby="report-findings-title">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">{c.findingsEyebrow}</p>
                <h2 id="report-findings-title">{c.findingsTitle}</h2>
              </div>
            </div>
            {props.findingGroups.length === 0 ? (
              <div className="limitations-box">
                <TriangleAlert aria-hidden="true" />
                <div>
                  <p>{c.findingsEmpty}</p>
                </div>
              </div>
            ) : (
              <FindingsBrowser groups={props.findingGroups} modules={props.modules} scannedAt={props.scannedAt} locale={locale} />
            )}
          </section>
        )}

        {authorized && props.priorities.length > 0 && (
          <details className={styles.detailDisclosure}>
            <summary>{c.prioritiesTitle} · {c.evidenceLabel}</summary>
            {props.priorities.map(priority => <article key={priority.key}>
              <h3>{priority.label}</h3>
              {priority.overallImpact && <p>{priority.overallImpact}</p>}
              {priority.summary && <p>{priority.summary}</p>}
              {priority.evidence && <div className="evidence-excerpt">
                <FactType type="Observed" /><strong>{priority.evidence.source}</strong>
                <span>{priority.evidence.excerpt}</span>
                {priority.evidence.observedAt && <small>{priority.evidence.observedAt}</small>}
              </div>}
              {priority.action && <div className="recommendation-line"><FactType type="Recommended" /><span>{priority.action}</span></div>}
            </article>)}
          </details>
        )}
        {authorized && props.proof && <details className={styles.detailDisclosure}><summary>{c.proofTitle}</summary><ProofPanels proof={props.proof} locale={locale} /></details>}

        {sample && <ContextualAssistant locale={locale} surface="report" />}
        <div className={styles.loop}><LoopStepper current="decide" locale={locale} /></div>

        {props.ctas.length > 0 && (
          <SectionCard className="retention-summary report-contact">
            <div>
              <MessageCircle aria-hidden="true" />
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
