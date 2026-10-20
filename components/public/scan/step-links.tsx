"use client"

import { Check, CircleAlert, AtSign } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { normaliseInstagramHandle } from "@/lib/funnel/scan-start"
import { interpolate } from "@/lib/share"

import { type ScanWizard } from "./use-scan-wizard"

/** Step 3: website and Instagram (both optional) and the sources this scan will request. */
export function StepLinks({ w }: { w: ScanWizard }) {
  const { hydrated, c, draft, update, igSearch, websiteInput, website, requestedSources, requestedCount, findInstagram } = w
  return (
    <div className="step-content">
      <div className="two-column-fields">
        <div className="field-stack">
          <Label htmlFor="website">
            {c.websiteLabel} <span>{c.optional}</span>
          </Label>
          <Input ref={websiteInput} disabled={!hydrated} id="website" inputMode="url" aria-invalid={!website.ok} aria-describedby={!website.ok ? "website-error" : "website-help"} value={draft.websiteUrl} onChange={(event) => update({ websiteUrl: event.target.value })} />
          <small id="website-help">{c.websiteHelp}</small>
          {!website.ok ? <small id="website-error">{c.errors.website}</small> : null}
        </div>
        <div className="field-stack">
          <Label htmlFor="instagram">
            {c.instagramLabel} <span>{c.optional}</span>
          </Label>
          <div className="input-with-icon">
            <AtSign />
            <Input disabled={!hydrated}
              id="instagram"
              value={draft.instagramHandle}
              onChange={(event) => update({ instagramHandle: event.target.value, instagramMatchProvenance: null })}
            />
          </div>
          <small>{c.instagramHelp}</small>
        </div>
      </div>
      <Button type="button" variant="outline" disabled={igSearch.status === "searching" || !draft.businessName.trim()} onClick={() => void findInstagram()}>
        {igSearch.status === "searching" ? c.igSearching : c.igFind}
      </Button>
      {igSearch.candidates.length > 0 && (
        <>
          <h2 className="step-kicker">{c.igChooseHeading}</h2>
          {igSearch.candidates.map((candidate) => {
            const selected = normaliseInstagramHandle(draft.instagramHandle) === candidate.handle
            return (
              <div key={candidate.id} className={`candidate-card ${selected ? "selected" : ""}`}>
                <div className="candidate-map">
                  <AtSign />
                </div>
                <div>
                  <h2>@{candidate.handle}</h2>
                  {candidate.displayName && <p>{candidate.displayName}</p>}
                  {candidate.bioSnippet && <p>{candidate.bioSnippet}</p>}
                  <small>{candidate.provenance === "gbp_cross_referenced" ? c.igSourceWebsite : c.igSourceSearch}</small>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => update({ instagramHandle: candidate.handle, instagramMatchProvenance: "picker_confirmed" })}
                >
                  {selected ? (
                    <>
                      <Check /> {c.igSelected}
                    </>
                  ) : (
                    c.igSelect
                  )}
                </Button>
              </div>
            )
          })}
        </>
      )}
      {igSearch.message && (
        <div className="partial-warning">
          <CircleAlert />
          <div>
            <p>{igSearch.message}</p>
          </div>
        </div>
      )}
      <div className="coverage-preview">
        <div className="coverage-preview-head">
          <div>
            <span>{c.coverageHeading}</span>
            <strong>{interpolate(c.coverageRequested, { count: requestedCount })}</strong>
          </div>
          <Badge variant="outline">{c.coverageNonBinding}</Badge>
        </div>
        <div className="coverage-source-list">
          {requestedSources.map((source) => (
            <span key={source.key}>
              {source.ok ? <Check /> : <CircleAlert />} {source.label}
              {source.note ? ` · ${source.note}` : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
