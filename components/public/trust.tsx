import { ArrowRight, FileCheck2, LockKeyhole, ShieldCheck, UserCheck, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { PublicPageFrame } from "@/components/product-ui"
import { ApprovalFlow } from "@/components/visual/steps"
import { copy, type PrototypeLocale } from "@/lib/copy"

const PILLAR_ICONS: LucideIcon[] = [ShieldCheck, UserCheck, LockKeyhole, FileCheck2]

/**
 * Security, privacy and human control. The approval boundary is shown with
 * the same ApprovalFlow the workspace uses (lock before Approved). The data
 * boundary rows are the existing, reviewed copy (copy.funnel.trust): no
 * retention period is published that nothing enforces.
 */
export function TrustPage({ locale }: { locale: PrototypeLocale }) {
  const c = copy[locale]
  const t = c.siteInfo.trust
  const boundary = c.funnel.trust
  return (
    <PublicPageFrame locale={locale}>
      <main className="pl-page">
        <header className="pl-section pl-intro">
          <span className="pl-chip">{t.badge}</span>
          <h1 className="pl-title">{t.title}</h1>
          <p className="pl-lead">{boundary.intro}</p>
        </header>

        <section className="pl-section" aria-label={t.badge}>
          <ul className="pl-pillars">
            {t.pillars.map((pillar, index) => {
              const Icon = PILLAR_ICONS[index] ?? ShieldCheck
              return (
                <li key={pillar.title} className="pl-step">
                  <span className="pl-step-icon" aria-hidden="true"><Icon /></span>
                  <h2 className="pl-card-title">{pillar.title}</h2>
                  <p>{pillar.body}</p>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="pl-section" aria-labelledby="pl-approval-title">
          <h2 id="pl-approval-title" className="pl-heading">{t.approval.title}</h2>
          <div className="pl-panel"><ApprovalFlow state="needsApproval" locale={locale} /></div>
          <ol className="pl-steps">
            {t.approval.steps.map((step, index) => (
              <li key={step.title} className="pl-step">
                <span className="pl-step-num" aria-hidden="true">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="pl-section" aria-labelledby="pl-boundary-title">
          <p className="pl-eyebrow">{boundary.boundaryEyebrow}</p>
          <h2 id="pl-boundary-title" className="pl-heading">{boundary.boundaryTitle}</h2>
          <dl className="pl-panel pl-dl">
            {boundary.rows.map((row) => (
              <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
            ))}
          </dl>
          <p className="pl-aside">{boundary.retentionNote}</p>
          <Link className="pl-link inline-flex items-center gap-1" href={`/${locale}/legal/privacy`}>{boundary.policyLink}<ArrowRight aria-hidden="true" className="size-4" /></Link>
        </section>

        <aside className="pl-limits" aria-labelledby="pl-retention-title">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h2 id="pl-retention-title">{t.retention.title}</h2>
            <p>{t.retention.body}</p>
            <Link className="pl-link" href={`/${locale}/methodology`}>{t.retention.link}</Link>
          </div>
        </aside>
      </main>
    </PublicPageFrame>
  )
}
