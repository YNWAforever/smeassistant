"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { coveredTop, revealElement, useRevealError } from "@/hooks/use-reveal-error"
import { copy, type PrototypeLocale } from "@/lib/copy"
import {fetchJsonWithinDeadline,FinderRequestError} from '@/lib/scanner/bounded-request'
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
  buildScanStartPayload,
  candidateHasIdentity,
  emptyScanDraft,
  forgetScanSubmissionKey,
  isJobId,
  layeredSubmissionStorage,
  normaliseInstagramHandle,
  scanSubmissionKeyFor,
  type ScanDraft,
  type ScanMarket,
  type ScanObjective,
} from "@/lib/funnel/scan-start"
import { generateIdempotencyKey } from "@/lib/funnel/unlock"
import type { TemplateKey } from "@/lib/workspace/templates"
import { t } from "@/lib/i18n"
import { scanStartRefusal } from "@/lib/budgets/messages"
import { resolveScanWebsite } from "@/lib/scan/website-url"
import { DISTRICTS_HK, DISTRICTS_TW, INDUSTRIES_HK, INDUSTRIES_TW } from "@sme-scanner/region"

// Keep the initial wizard controls inert until their handlers are attached.
const subscribeHydration = () => () => {}
const clientHydrated = () => true
const serverHydrated = () => false

export const OBJECTIVE_MESSAGE_KEYS: Record<ScanObjective, string> = {
  more_leads: "scanner.objectiveMoreLeads",
  better_visibility: "scanner.objectiveBetterVisibility",
  improve_trust: "scanner.objectiveImproveTrust",
  understand_performance: "scanner.objectiveUnderstandPerformance",
}

type SearchState = { status: "idle" | "searching" | "done"; candidates: MerchantCandidate[]; message: string | null }

export type ScanWizardProps = {
  locale: PrototypeLocale
  initialMarket: ScanMarket
  initialBusiness?: string
  /** Item 8: the outcome the visitor picked on a landing-page link, already validated against known template keys server-side. Carried silently -- there is no step in this form that shows or edits it. */
  initialIntent?: TemplateKey | null
  /** Resolved on the server so a deployment override reaches the client. */
  consentPolicyVersion: string
}

/**
 * State, search, validation and submission for the four-step scan form
 * (moved verbatim from components/scan-page.tsx; behaviour unchanged). The
 * step components render from what this returns.
 */
export function useScanWizard({ locale, initialMarket, initialBusiness, initialIntent, consentPolicyVersion }: ScanWizardProps) {
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated)
  const c = copy[locale].funnel.scan
  const language = copy[locale].language
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<ScanDraft>(() => emptyScanDraft(initialMarket, initialBusiness?.trim() ?? "", initialIntent ?? null))
  const [consent, setConsent] = useState(false)
  // Seeded from the prop but held in state: on a 409 the server tells us the
  // version it publishes now, and posting the stale prop again would loop.
  const [policyVersion, setPolicyVersion] = useState(consentPolicyVersion)
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
  const websiteInput = useRef<HTMLInputElement>(null)
  const errorBanner = useRef<HTMLDivElement>(null)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef(step)
  // F-13: holds the submission key when session storage is unavailable.
  const submissionMemory = useRef(new Map<string, string>())
  const website = resolveScanWebsite(draft)
  const validWebsite = website.ok
  const resolvedWebsite = website.ok ? website.value : null

  const update = useCallback((patch: Partial<ScanDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }, [])

  const industries = draft.market === "tw" ? INDUSTRIES_TW : INDUSTRIES_HK
  const districts = draft.market === "tw" ? DISTRICTS_TW : DISTRICTS_HK
  const searchMarket: "HK" | "TW" = draft.market === "tw" ? "TW" : "HK"

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
          // P3.5d: a paused-scans refusal is not a generic provider failure.
          const paused = scanStartRefusal(locale, response.status, data.error)
          setSearch({ status: "done", candidates: [], message: paused ?? t(locale, CANDIDATE_ERROR_KEYS[parseSearchError(response.status, data)]) })
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
    if (!website.ok) { setError(c.errors.website); websiteInput.current?.focus(); return }
    setIgSearch({ status: "searching", candidates: [], message: null })
    try {
      const { url, init } = buildInstagramSearchRequest({
        market: searchMarket,
        businessName: draft.businessName,
        sessionId: businessSearchSessionId(),
        ...(draft.district ? { district: draft.district } : {}),
        ...(website.value ? { websiteUrl: website.value } : {}),
      })
      const result=await fetchJsonWithinDeadline(url,init)
      const response=result.response
      const data=result.data as { outcome?: string; error?: string; candidates?: InstagramCandidate[] }
      if (isSearchFailure(response.status, data)) {
        // P3.5d: a paused-scans refusal is not a generic provider failure.
        const paused = scanStartRefusal(locale, response.status, data.error)
        setIgSearch({ status: "done", candidates: [], message: paused ?? t(locale, CANDIDATE_ERROR_KEYS[parseSearchError(response.status, data)]) })
        return
      }
      const candidates = (data.candidates ?? []).slice(0, MAX_CANDIDATES_SHOWN)
      setIgSearch({ status: "done", candidates, message: candidates.length ? null : c.igNoResults })
    } catch (error) {
      setIgSearch({ status: "done", candidates: [], message: t(locale,error instanceof FinderRequestError && error.code==='timeout'?CANDIDATE_ERROR_KEYS[parseSearchError(504,{error:'TIMEOUT'})]:"scanner.candidateErrorNetwork") })
    }
  }

  const requestedSources = useMemo(() => {
    const confirmed = candidateHasIdentity(draft.candidate) && !draft.manualEntry
    return [
      { key: "google", label: c.sourceGoogle, ok: confirmed, note: confirmed ? null : c.sourceManual },
      { key: "website", label: c.sourceWebsite, ok: validWebsite && Boolean(resolvedWebsite), note: !validWebsite ? c.errors.website : resolvedWebsite ? null : c.sourceNotProvided },
      { key: "aeo", label: c.sourceSearchAi, ok: true, note: null },
      {
        key: "instagram",
        label: c.sourceInstagram,
        ok: Boolean(normaliseInstagramHandle(draft.instagramHandle)),
        note: normaliseInstagramHandle(draft.instagramHandle) ? null : c.sourceNotProvided,
      },
    ]
  }, [c, draft.candidate, draft.instagramHandle, draft.manualEntry, validWebsite, resolvedWebsite])

  const requestedCount = requestedSources.filter((source) => source.ok).length

  // Continue sits at the foot of a long step, so the next step used to open
  // scrolled to its bottom. Start each new step at its title, and give the
  // title focus so keyboard and screen-reader users land there too.
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    const heading = stepHeading.current
    if (!heading) return
    heading.focus({ preventScroll: true })
    const card = heading.closest(".flow-card")
    if (card && heading.getBoundingClientRect().top < coveredTop()) revealElement(heading, card)
  }, [step])

  useRevealError(errorBanner, error)

  async function startScan() {
    setSubmitting(true)
    setError("")
    const storage = layeredSubmissionStorage(submissionMemory.current, () => window.sessionStorage)
    try {
      const payload = buildScanStartPayload(draft, locale, { granted: consent, policyVersion })
      // F-13: a retry of this exact submission reuses its key, so the server
      // returns the scan it already queued instead of charging for another.
      const submissionKey = scanSubmissionKeyFor(payload, storage, Date.now(), generateIdempotencyKey)
      const response = await fetch("/api/scan/start", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...payload, submission_key: submissionKey }),
      })
      const data = (await response.json().catch(() => ({}))) as { jobId?: string; error?: string; policy_version?: string }
      // The key belongs to another scan (it cannot match this payload). Drop it
      // so the next press is a fresh submission; consent is left as given.
      if (response.status === 409 && data.error === "submission_key_conflict") {
        forgetScanSubmissionKey(storage)
        setError(c.errors.submit)
        return
      }
      if (response.status === 429) {
        setError(t(locale, "scanner.candidateErrorRateLimited"))
        return
      }
      // P3.5a: the global scan budget, instead of the server's raw error string.
      const refusal = scanStartRefusal(locale, response.status, data.error)
      if (refusal) {
        setError(refusal)
        return
      }
      // The privacy notice changed while this tab was open. Adopt the version
      // the server publishes now, refresh so step 4 renders the current text,
      // and ask again -- re-posting the stale version would 409 forever.
      if (response.status === 409) {
        if (data.policy_version) setPolicyVersion(data.policy_version)
        setConsent(false)
        setStep(4)
        setError(c.errors.consentStale)
        router.refresh()
        return
      }
      if (!response.ok || !isJobId(data.jobId)) {
        // The server's own strings ("Failed to create scan job", validation
        // messages) are English diagnostics, not owner copy.
        setError(data.error === "website_url is invalid" ? c.errors.website : c.errors.submit)
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
    if (step >= 3 && !website.ok) {
      setError(c.errors.website)
      setStep(3)
      websiteInput.current?.focus()
      return
    }
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


  return {
    hydrated, c, language, step, setStep, draft, update, consent, setConsent, error, setError, submitting, marketChanged,
    search, igSearch, runSearch, searchMarket, websiteInput, errorBanner, stepHeading, website, requestedSources, requestedCount,
    industries, districts, findInstagram, next, changeMarket, confidenceLabel,
  }
}

export type ScanWizard = ReturnType<typeof useScanWizard>
