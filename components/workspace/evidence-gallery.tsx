import { ImageOff } from "lucide-react"

import { SectionCard } from "@/components/product-ui"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { EvidenceGalleryItem } from "@/lib/report/view-model"
import { interpolate } from "@/lib/share"

/**
 * Home evidence gallery (CLAUDE.md Phase 6 item 3): the same signed-URL
 * gallery the report renders, reusing the report's `evidence-passport`
 * markup and trilingual copy so both surfaces read identically. Signed URLs
 * expire after 300 s, which is why the page is `force-dynamic`. Renders
 * nothing when there is nothing stored.
 */
export function EvidenceGallery({ locale, items }: { locale: PrototypeLocale; items: EvidenceGalleryItem[] | null | undefined }) {
  if (!items || items.length === 0) return null
  const c = copy[locale].funnel.report
  return (
    <SectionCard className="evidence-gallery-card">
      <div className="section-card-heading"><div><p className="eyebrow">{c.evidenceEyebrow}</p><h2>{c.evidenceTitle}</h2></div></div>
      <p className="proof-caveat">{c.evidenceBody}</p>
      <div className="evidence-passport">
        {items.map((item) => (
          <article key={item.id}>
            <div>
              {item.mediaUrl ? (
                // Short-lived signed Supabase URLs: not routable through next/image without remotePatterns, same as the report.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.mediaUrl} alt={item.text ?? `${item.provider} ${item.evidenceType}`} loading="lazy" decoding="async" />
              ) : (
                <span className="collector-icon collector-unavailable" aria-hidden="true"><ImageOff /></span>
              )}
              <h3>{`${item.provider} · ${item.evidenceType}`}</h3>
              {item.text && <p>{item.text}</p>}
              <small>{interpolate(c.evidenceCaptured, { date: isoDate(item.capturedAt) ?? "" })}</small>
              {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">{c.evidenceSource}</a>}
            </div>
            <div className="evidence-passport-value">
              <strong>{item.status === "stored" ? c.measuredLabel : item.status === "metadata_only" ? c.evidenceMetadataOnly : c.evidenceFailed}</strong>
              {item.limitationCode && <small>{item.limitationCode}</small>}
            </div>
          </article>
        ))}
      </div>
    </SectionCard>
  )
}

function isoDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10)
}
