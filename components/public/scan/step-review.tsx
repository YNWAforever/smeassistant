"use client"

import { LockKeyhole } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { PrototypeLocale } from "@/lib/copy"
import { candidateHasIdentity } from "@/lib/funnel/scan-start"
import { t } from "@/lib/i18n"

import { OBJECTIVE_MESSAGE_KEYS, type ScanWizard } from "./use-scan-wizard"

/** Step 4: review and the public-evidence consent the scan needs. */
export function StepReview({ w, locale }: { w: ScanWizard; locale: PrototypeLocale }) {
  const { c, language, draft, consent, setConsent, setError, requestedSources, industries, districts } = w
  return (
    <div className="step-content">
      <div className="scan-review-card">
        <h2>{c.reviewHeading}</h2>
        <dl>
          <div>
            <dt>{c.reviewBusiness}</dt>
            <dd>{draft.businessName.trim()}</dd>
          </div>
          <div>
            <dt>{c.reviewIdentity}</dt>
            <dd>{candidateHasIdentity(draft.candidate) && !draft.manualEntry ? c.identityConfirmed : c.identityManual}</dd>
          </div>
          <div>
            <dt>{c.reviewMarket}</dt>
            <dd>{draft.market === "tw" ? c.tw : c.hk}</dd>
          </div>
          <div>
            <dt>{c.reviewLanguage}</dt>
            <dd>{language}</dd>
          </div>
          <div>
            <dt>{c.reviewIndustry}</dt>
            <dd>
              {(locale === "en"
                ? industries.find((industry) => industry.value === draft.industry)?.labelEn
                : industries.find((industry) => industry.value === draft.industry)?.label) ?? draft.industry}
            </dd>
          </div>
          <div>
            <dt>{c.reviewDistrict}</dt>
            <dd>{(locale === "en" ? districts.find((district) => district.zh === draft.district)?.en : draft.district) ?? draft.district}</dd>
          </div>
          <div>
            <dt>{c.reviewObjective}</dt>
            <dd>{t(locale, OBJECTIVE_MESSAGE_KEYS[draft.objective])}</dd>
          </div>
          <div>
            <dt>{c.reviewSources}</dt>
            <dd>{requestedSources.filter((source) => source.ok).map((source) => source.label).join(" · ")}</dd>
          </div>
        </dl>
      </div>
      <Label className="consent-row" htmlFor="scan-consent">
        <Checkbox
          id="scan-consent"
          checked={consent}
          onCheckedChange={(value) => {
            setConsent(Boolean(value))
            setError("")
          }}
        />
        <span>
          <strong>{c.consentTitle}</strong>
          <small>{c.consentBody}</small>
        </span>
      </Label>
      <div className="privacy-note">
        <LockKeyhole />
        <span>{c.privacyNote}</span>
      </div>
    </div>
  )
}
