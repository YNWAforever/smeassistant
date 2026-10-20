"use client"

import { Languages } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PrototypeLocale } from "@/lib/copy"
import { SCAN_OBJECTIVES, type ScanMarket, type ScanObjective } from "@/lib/funnel/scan-start"
import { t } from "@/lib/i18n"

import { OBJECTIVE_MESSAGE_KEYS, type ScanWizard } from "./use-scan-wizard"

/** Step 2: market, industry, district and goal. The market is chosen here, never from the language. */
export function StepDetails({ w, locale }: { w: ScanWizard; locale: PrototypeLocale }) {
  const { c, language, draft, update, industries, districts, changeMarket } = w
  return (
    <div className="step-content">
      <div className="field-stack">
        <Label>{c.marketLabel}</Label>
        <RadioGroup value={draft.market} onValueChange={(value) => changeMarket(value as ScanMarket)}>
          <Label className="consent-row" htmlFor="market-hk">
            <RadioGroupItem id="market-hk" value="hk" />
            <span>
              <strong>{c.hk}</strong>
              <small>{c.hkMeta}</small>
            </span>
          </Label>
          <Label className="consent-row" htmlFor="market-tw">
            <RadioGroupItem id="market-tw" value="tw" />
            <span>
              <strong>{c.tw}</strong>
              <small>{c.twMeta}</small>
            </span>
          </Label>
        </RadioGroup>
        <small>{c.marketHelp}</small>
      </div>
      <div className="two-column-fields">
        <div className="field-stack">
          <Label>{c.languageLabel}</Label>
          <div className="read-only-field">
            <Languages />
            {language}
            <Badge variant="outline">{c.languageSeparate}</Badge>
          </div>
          <small>{c.languageHelp}</small>
        </div>
        <div className="field-stack">
          <Label htmlFor="scan-industry">{t(locale, "scanner.industryLabel")}</Label>
          <Select value={draft.industry} onValueChange={(value) => update({ industry: value })}>
            <SelectTrigger id="scan-industry" className="w-full">
              <SelectValue placeholder={t(locale, "scanner.industryPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {industries.map((industry) => (
                <SelectItem key={industry.value} value={industry.value}>
                  {locale === "en" ? industry.labelEn : industry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="field-stack">
          <Label htmlFor="scan-district">{t(locale, "scanner.districtLabel")}</Label>
          <Select value={draft.district} onValueChange={(value) => update({ district: value })}>
            <SelectTrigger id="scan-district" className="w-full">
              <SelectValue placeholder={t(locale, "scanner.districtPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {districts.map((district) => (
                <SelectItem key={district.zh} value={district.zh}>
                  {locale === "en" ? district.en : district.zh}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="field-stack">
        <Label>{t(locale, "scanner.objectiveLabel")}</Label>
        <RadioGroup value={draft.objective} onValueChange={(value) => update({ objective: value as ScanObjective })}>
          {SCAN_OBJECTIVES.map((objective) => (
            <Label className="consent-row" key={objective} htmlFor={`objective-${objective}`}>
              <RadioGroupItem id={`objective-${objective}`} value={objective} />
              <span>
                <strong>{t(locale, OBJECTIVE_MESSAGE_KEYS[objective])}</strong>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>
    </div>
  )
}
