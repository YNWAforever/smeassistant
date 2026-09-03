"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleAlert,
  AtSign,
  Languages,
  Link2,
  LockKeyhole,
  MapPin,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"

import { PublicPageFrame } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { copy, type PrototypeLocale } from "@/lib/copy"
import {
  BUSINESS_SEARCH_DEBOUNCE_MS,
  CANDIDATE_ERROR_KEYS,
  MAX_CANDIDATES_SHOWN,
  buildCandidateSearchRequest,
  buildInstagramSearchRequest,
  businessSearchSessionId,
  isSearchFailure,
  normalizeMerchantQuery,
  parseSearchError,
  shouldSearchMerchantQuery,
  type InstagramCandidate,
  type MerchantCandidate,
  type MerchantSearchResponse,
} from "@/lib/funnel/business-search"
import {
  SCAN_OBJECTIVES,
  buildScanStartPayload,
  candidateHasIdentity,
  emptyScanDraft,
  isJobId,
  normaliseInstagramHandle,
  type ScanDraft,
  type ScanMarket,
  type ScanObjective,
} from "@/lib/funnel/scan-start"
import { t } from "@/lib/i18n"
import { interpolate } from "@/lib/share"
import { DISTRICTS_HK, DISTRICTS_TW, INDUSTRIES_HK, INDUSTRIES_TW } from "@sme-scanner/region"

const OBJECTIVE_MESSAGE_KEYS: Record<ScanObjective, string> = {
  more_leads: "scanner.objectiveMoreLeads",
  better_visibility: "scanner.objectiveBetterVisibility",
  improve_trust: "scanner.objectiveImproveTrust",
  understand_performance: "scanner.objectiveUnderstandPerformance",
}

type SearchState = { status: "idle" | "searching" | "done"; candidates: MerchantCandidate[]; message: string | null }

export function ScanPage({
  locale,
  initialMarket,
  initialBusiness,
}: {
  locale: PrototypeLocale
  initialMarket: ScanMarket
  initialBusiness?: string
}) {
  const c = copy[locale].funnel.scan
  const language = copy[locale].language
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<ScanDraft>(() => emptyScanDraft(initialMarket, initialBusiness?.trim() ?? ""))
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [marketChanged, setMarketChanged] = useState(false)
  const [search, setSearch] = useState<SearchState>({ status: "idle", candidates: [], message: null })
  const [igSearch, setIgSearch] = useState<{ status: "idle" | "searching" | "done"; candidates: InstagramCandidate[]; message: string | null }>({
    status: "idle",
    candidates: [],
    message: null,
  })

  const requestId = useRef(0)
  const lastQuery = useRef("")

  const update = useCallback((patch: Partial<ScanDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }, [])

  const industries = draft.market === "tw" ? INDUSTRIES_TW : INDUSTRIES_HK
  const districts = draft.market === "tw" ? DISTRICTS_TW : DISTRICTS_HK
  const searchMarket = draft.market === "tw" ? "TW" : "HK"

  const runSearch = useCallback(
    async (query: string, market: "HK" | "TW") => {
      const id = ++requestId.current
      lastQuery.current = `${market}:${normalizeMerchantQuery(query)}`
      setSearch({ status: "searching", candidates: [], message: null })
      try {
        const { url, init } = buildCandidateSearchRequest({ market, query, sessionId: businessSearchSessionId() })
        const response = await fetch(url, init)
        const data = (await response.json().catch(() => ({}))) as MerchantSearchResponse
        if (id !== requestId.current) return
        if (isSearchFailure(response.status, data)) {
          setSearch({ status: "done", candidates: [], message: t(locale, CANDIDATE_ERROR_KEYS[parseSearchError(response.status, data)]) })
          return
        }
        const candidates = (data.candidates ?? []).slice(0, MAX_CANDIDATES_SHOWN)
        setSearch({
          status: "done",
          candidates,
          message: candidates.length ? null : t(locale, market === "TW" ? "scanner.candidateNoResultsTW" : "scanner.candidateNoResultsHK"),
        })
      } catch {
        if (id !== requestId.current) return
        setSearch({ status: "done", candidates: [], message: t(locale, "scanner.candidateErrorNetwork") })
      }
    },
    [locale],
  )

  // Debounced automatic search: 450 ms after the last keystroke, and never for a
  // query the server would reject (fewer than two meaningful characters).
  useEffect(() => {
    if (step !== 1) return
    const query = draft.mapsUrl.trim() || draft.businessName
    if (!shouldSearchMerchantQuery(query)) return
    if (lastQuery.current === `${searchMarket}:${normalizeMerchantQuery(query)}`) return
    const timer = setTimeout(() => void runSearch(query, searchMarket), BUSINESS_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft.businessName, draft.mapsUrl, runSearch, searchMarket, step])

  async function findInstagram() {
    setIgSearch({ status: "searching", candidates: [], message: null })
    try {
      const { url, init } = buildInstagramSearchRequest({
        market: searchMarket,
        businessName: draft.businessName,
        sessionId: businessSearchSessionId(),
        ...(draft.district ? { district: draft.district } : {}),
        ...(draft.websiteUrl.trim() ? { websiteUrl: draft.websiteUrl.trim() } : {}),
      })
      const response = await fetch(url, init)
      const data = (await response.json().catch(() => ({}))) as { outcome?: string; error?: string; candidates?: InstagramCandidate[] }
      if (isSearchFailure(response.status, data)) {
        setIgSearch({ status: "done", candidates: [], message: t(locale, CANDIDATE_ERROR_KEYS[parseSearchError(response.status, data)]) })
        return
      }
      const candidates = (data.candidates ?? []).slice(0, MAX_CANDIDATES_SHOWN)
      setIgSearch({ status: "done", candidates, message: candidates.length ? null : c.igNoResults })
    } catch {
      setIgSearch({ status: "done", candidates: [], message: t(locale, "scanner.candidateErrorNetwork") })
    }
  }

  const requestedSources = useMemo(() => {
    const confirmed = candidateHasIdentity(draft.candidate) && !draft.manualEntry
    return [
      { key: "google", label: c.sourceGoogle, ok: confirmed, note: confirmed ? null : c.sourceManual },
      { key: "website", label: c.sourceWebsite, ok: Boolean(draft.websiteUrl.trim()), note: draft.websiteUrl.trim() ? null : c.sourceNotProvided },
      { key: "aeo", label: c.sourceSearchAi, ok: true, note: null },
      {
        key: "instagram",
        label: c.sourceInstagram,
        ok: Boolean(normaliseInstagramHandle(draft.instagramHandle)),
        note: normaliseInstagramHandle(draft.instagramHandle) ? null : c.sourceNotProvided,
      },
    ]
  }, [c, draft.candidate, draft.instagramHandle, draft.manualEntry, draft.websiteUrl])

  const requestedCount = requestedSources.filter((source) => source.ok).length

  async function startScan() {
    setSubmitting(true)
    setError("")
    try {
      const response = await fetch("/api/scan/start", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(buildScanStartPayload(draft, locale)),
      })
      const data = (await response.json().catch(() => ({}))) as { jobId?: string; error?: string }
      if (response.status === 429) {
        setError(t(locale, "scanner.candidateErrorRateLimited"))
        return
      }
      if (!response.ok || !isJobId(data.jobId)) {
        setError(data.error ?? c.errors.submit)
        return
      }
      router.push(`/${locale}/scanning/${data.jobId}`)
    } catch {
      setError(c.errors.network)
    } finally {
      setSubmitting(false)
    }
  }

  function next() {
    if (step === 1 && !draft.businessName.trim()) {
      setError(c.errors.business)
      return
    }
    if (step === 1 && !candidateHasIdentity(draft.candidate) && !draft.manualEntry) {
      setError(c.errors.place)
      return
    }
    if (step === 2 && !draft.industry) {
      setError(c.errors.industry)
      return
    }
    if (step === 2 && !draft.district) {
      setError(c.errors.district)
      return
    }
    if (step === 4 && !consent) {
      setError(c.errors.consent)
      return
    }
    setError("")
    if (step < 4) setStep(step + 1)
    else void startScan()
  }

  function changeMarket(value: ScanMarket) {
    if (value === draft.market) return
    setMarketChanged(true)
    setSearch({ status: "idle", candidates: [], message: null })
    lastQuery.current = ""
    update({ market: value, candidate: null, manualEntry: false, industry: "", district: "" })
  }

  const confidenceLabel = (candidate: MerchantCandidate) =>
    candidate.matchConfidence === "high" ? c.confidenceHigh : candidate.matchConfidence === "medium" ? c.confidenceMedium : c.confidenceLow

  return (
    <PublicPageFrame locale={locale}>
      <main className="flow-page">
        <Link className="back-link" href={`/${locale}`}>
          <ChevronLeft /> {c.backHome}
        </Link>
        <div className="flow-layout">
          <aside className="flow-steps" aria-label={c.eyebrow}>
            <p className="eyebrow">{c.eyebrow}</p>
            <ol>
              {c.stepTitles.map((label, index) => (
                <li key={label} className={step === index + 1 ? "is-active" : step > index + 1 ? "is-complete" : ""}>
                  <span>{step > index + 1 ? <Check /> : index + 1}</span>
                  <div>
                    <strong>{label}</strong>
                    <small>{c.stepHints[index]}</small>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flow-security">
              <ShieldCheck />
              <div>
                <strong>{c.securityTitle}</strong>
                <p>{c.securityBody}</p>
              </div>
            </div>
          </aside>
          <section className="flow-card" aria-live="polite">
            <div className="flow-card-header">
              <div>
                <span>{interpolate(c.stepOf, { step })}</span>
                <h1>{c.stepTitles[step - 1]}</h1>
              </div>
            </div>
            <Progress value={step * 25} aria-label={interpolate(c.progressLabel, { percent: step * 25 })} />
            {error && (
              <div className="form-error" role="alert">
                <CircleAlert /> {error}
              </div>
            )}

            {step === 1 && (
              <div className="step-content">
                <div className="field-stack">
                  <Label htmlFor="scan-business">{c.businessLabel}</Label>
                  <div className="input-with-icon">
                    <Search />
                    <Input
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
                    <Input
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
                  disabled={search.status === "searching" || !shouldSearchMerchantQuery(draft.mapsUrl.trim() || draft.businessName)}
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
            )}

            {step === 2 && (
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
            )}

            {step === 3 && (
              <div className="step-content">
                <div className="two-column-fields">
                  <div className="field-stack">
                    <Label htmlFor="website">
                      {c.websiteLabel} <span>{c.optional}</span>
                    </Label>
                    <Input id="website" inputMode="url" value={draft.websiteUrl} onChange={(event) => update({ websiteUrl: event.target.value })} />
                    <small>{c.websiteHelp}</small>
                  </div>
                  <div className="field-stack">
                    <Label htmlFor="instagram">
                      {c.instagramLabel} <span>{c.optional}</span>
                    </Label>
                    <div className="input-with-icon">
                      <AtSign />
                      <Input
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
            )}

            {step === 4 && (
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
            )}

            <div className="flow-card-footer">
              <Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1 || submitting}>
                <ChevronLeft /> {c.back}
              </Button>
              <Button onClick={next} disabled={submitting}>
                {step === 4 ? (submitting ? c.submitting : c.start) : c.continue}
                <ArrowRight />
              </Button>
            </div>
          </section>
        </div>
      </main>
    </PublicPageFrame>
  )
}
