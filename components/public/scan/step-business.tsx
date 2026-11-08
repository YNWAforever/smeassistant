"use client"

import { Check, CircleAlert, Link2, MapPin, Search, ShieldCheck, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PrototypeLocale } from "@/lib/copy"
import { shouldSearchMerchantQuery } from "@/lib/funnel/business-search"
import { t } from "@/lib/i18n"
import { interpolate } from "@/lib/share"

import { type ScanWizard } from "./use-scan-wizard"

/** Step 1: find the business on Google, or enter it manually. */
export function StepBusiness({ w, locale }: { w: ScanWizard; locale: PrototypeLocale }) {
  const { hydrated, c, draft, update, setError, marketChanged, search, runSearch, searchMarket, confidenceLabel } = w
  return (
    <div className="step-content">
      <div className="field-stack">
        <Label htmlFor="scan-business">{c.businessLabel}</Label>
        <div className="input-with-icon">
          <Search />
          <Input disabled={!hydrated}
            id="scan-business"
            value={draft.businessName}
            onChange={(event) => {
              update({ businessName: event.target.value, candidate: null, manualEntry: false })
              setError("")
            }}
          />
        </div>
        <small>{c.businessHint}</small>
      </div>
      <div className="field-stack">
        <Label htmlFor="scan-maps-url">
          {t(locale, "scanner.manualMapsUrlLabel")} <span>{c.optional}</span>
        </Label>
        <div className="input-with-icon">
          <Link2 />
          <Input disabled={!hydrated}
            id="scan-maps-url"
            inputMode="url"
            value={draft.mapsUrl}
            onChange={(event) => {
              update({ mapsUrl: event.target.value, candidate: null, manualEntry: false })
              setError("")
            }}
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={!hydrated || search.status === "searching" || !shouldSearchMerchantQuery(draft.mapsUrl.trim() || draft.businessName)}
        onClick={() => void runSearch(draft.mapsUrl.trim() || draft.businessName, searchMarket)}
      >
        {search.status === "searching" ? c.searching : c.searchButton}
      </Button>

      {marketChanged && (
        <div className="partial-warning">
          <TriangleAlert />
          <div>
            <p>{c.marketChanged}</p>
          </div>
        </div>
      )}

      {search.candidates.length > 0 && <h2 className="step-kicker">{c.chooseHeading}</h2>}
      {search.candidates.map((candidate) => {
        const selected = draft.candidate?.id === candidate.id
        return (
          <div key={candidate.id} className={`candidate-card ${selected ? "selected" : ""}`}>
            <div className="candidate-map">
              <MapPin />
            </div>
            <div>
              <Badge>{c.matchBadge}</Badge>
              <h2>{candidate.name}</h2>
              {candidate.address && <p>{candidate.address}</p>}
              {typeof candidate.reviews === "number" && (
                <p>
                  {typeof candidate.rating === "number"
                    ? interpolate(c.ratingLine, { rating: candidate.rating, reviews: candidate.reviews })
                    : interpolate(c.reviewsOnly, { reviews: candidate.reviews })}
                </p>
              )}
              <small>{interpolate(c.confidence, { confidence: confidenceLabel(candidate) })}</small>
              {candidate.marketMismatch && <small>{t(locale, "scanner.candidateMarketMismatch")}</small>}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                update({ candidate, manualEntry: false, businessName: candidate.name })
                setError("")
              }}
            >
              {selected ? (
                <>
                  <Check /> {c.selected}
                </>
              ) : (
                c.select
              )}
            </Button>
          </div>
        )
      })}
      {search.message && (
        <div className="partial-warning">
          <CircleAlert />
          <div>
            <p>{search.message}</p>
          </div>
        </div>
      )}

      <button
        className="text-action"
        disabled={!hydrated}
        type="button"
        onClick={() => {
          update({ candidate: null, manualEntry: true })
          setError("")
        }}
      >
        {c.manualEntry}
      </button>
      {draft.manualEntry && (
        <div className="partial-warning">
          <TriangleAlert />
          <div>
            <strong>{c.manualTitle}</strong>
            <p>{c.manualBody}</p>
          </div>
        </div>
      )}
      <p className="privacy-note">
        <ShieldCheck /> {c.verifyNote}
      </p>
    </div>
  )
}
