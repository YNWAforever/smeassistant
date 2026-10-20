import { FactType, SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { copy } from "@/lib/copy"
import type { ReportProofData, ReportProps } from "@/lib/funnel/report-props"

/** Sanitised public evidence behind the score (unlocked reports only). */
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

export function ProofPanels({ proof, locale }: { proof: ReportProofData; locale: ReportProps["locale"] }) {
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
        [p.followers, ig.followers == null ? p.unknown : String(ig.followers)],
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
        [p.rating, gbp.rating == null ? p.unknown : String(gbp.rating)],
        [p.reviews, gbp.reviewsCount == null ? p.unknown : String(gbp.reviewsCount)],
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
