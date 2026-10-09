import type { IgMatchProvenance, MatchConfidence, MerchantCandidate } from "./business-search";
import { TEMPLATES, type TemplateKey } from "@/lib/workspace/templates";
import { resolveScanWebsite } from "@/lib/scan/website-url";

export type ScanMarket = "hk" | "tw";

export const SCAN_OBJECTIVES = ["more_leads", "better_visibility", "improve_trust", "understand_performance"] as const;
export type ScanObjective = (typeof SCAN_OBJECTIVES)[number];

export function isScanObjective(value: unknown): value is ScanObjective {
  return typeof value === "string" && (SCAN_OBJECTIVES as readonly string[]).includes(value);
}

/** `?market=` from the landing page (hk|tw, any case); otherwise the locale's home market. */
export function normaliseMarketParam(value: string | null | undefined, locale: string): ScanMarket {
  const lower = value?.trim().toLowerCase();
  if (lower === "hk" || lower === "tw") return lower;
  return locale === "zh-TW" ? "tw" : "hk";
}

const TEMPLATE_KEYS = new Set<string>(TEMPLATES.map((t) => t.key));

/**
 * `?intent=` from a landing-page outcome-example link (item 8): which action
 * template the visitor was promised, carried silently through the scan draft
 * so a compatible action can be surfaced after claim. An unrecognised value is
 * dropped rather than kept -- there is nothing after claim it could match.
 */
export function normaliseIntentParam(value: string | null | undefined): TemplateKey | null {
  return value && TEMPLATE_KEYS.has(value) ? (value as TemplateKey) : null;
}

/** Everything the four scan steps collect before POST /api/scan/start. */
export interface ScanDraft {
  market: ScanMarket;
  businessName: string;
  /** A confirmed Google Business match from POST /api/business/search, if any. */
  candidate: MerchantCandidate | null;
  /** "This is not my business — continue with manual details". */
  manualEntry: boolean;
  /** Google Maps link the user pasted in step 1 (forwarded as maps_url). */
  mapsUrl: string;
  industry: string;
  district: string;
  objective: ScanObjective;
  websiteUrl: string;
  instagramHandle: string;
  instagramMatchProvenance: IgMatchProvenance | null;
  /** Item 8: the outcome the visitor picked on the landing page, if any. */
  intent: TemplateKey | null;
}

export function emptyScanDraft(market: ScanMarket, businessName = "", intent: TemplateKey | null = null): ScanDraft {
  return {
    market,
    businessName,
    candidate: null,
    manualEntry: false,
    mapsUrl: "",
    industry: "",
    district: "",
    objective: "better_visibility",
    websiteUrl: "",
    instagramHandle: "",
    instagramMatchProvenance: null,
    intent,
  };
}

export function candidateHasIdentity(candidate: MerchantCandidate | null): candidate is MerchantCandidate {
  return Boolean(candidate && (candidate.placeId || candidate.dataId || candidate.dataCid));
}

/** Step 1 is complete when a SerpApi identity was confirmed or manual entry was chosen. */
export function hasBusinessIdentity(draft: Pick<ScanDraft, "candidate" | "manualEntry">): boolean {
  return candidateHasIdentity(draft.candidate) || draft.manualEntry;
}

export function canStartScan(draft: ScanDraft): boolean {
  return Boolean(draft.businessName.trim()) && Boolean(draft.industry) && Boolean(draft.district) && hasBusinessIdentity(draft) && resolveScanWebsite(draft).ok;
}

/** Field names are upstream's POST /api/scan/start contract, verbatim (CLAUDE.md §3.2.2). */
export interface ScanStartPayload {
  business_name: string;
  market: "HK" | "TW";
  locale: string;
  industry: string;
  district: string;
  objective: ScanObjective;
  /**
   * Step-4 consent, now mandatory on the wire: the server records it in
   * consent_records and refuses the scan without it. The version is echoed back
   * so the server can prove the merchant agreed to the text it actually
   * published, and is only ever compared -- never stored from the client.
   */
  public_evidence_consent: true;
  consent_policy_version: string;
  place_id?: string;
  data_id?: string;
  data_cid?: string;
  place_match_confidence?: MatchConfidence;
  provider?: "serpapi";
  manual_entry?: boolean;
  continue_without_place?: boolean;
  ig_handle?: string;
  ig_match_provenance?: IgMatchProvenance;
  website_url?: string;
  address?: string;
  maps_url?: string;
  alternate_names?: string[];
  intent?: TemplateKey;
}

export function normaliseInstagramHandle(value: string): string {
  return value.trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
}

/**
 * Consent is a separate argument rather than part of `ScanDraft`: the draft
 * models merchant identity and is replayed on a rescan, whereas consent is an
 * act performed once, against a specific published policy version.
 */
export function buildScanStartPayload(
  draft: ScanDraft,
  locale: string,
  consent: { granted: boolean; policyVersion: string },
): ScanStartPayload {
  const payload: ScanStartPayload = {
    business_name: draft.businessName.trim(),
    market: draft.market === "tw" ? "TW" : "HK",
    locale,
    industry: draft.industry,
    district: draft.district,
    objective: draft.objective,
    public_evidence_consent: consent.granted as true,
    consent_policy_version: consent.policyVersion,
  };

  const candidate = draft.candidate;
  if (!draft.manualEntry && candidateHasIdentity(candidate)) {
    if (candidate.placeId) payload.place_id = candidate.placeId;
    if (candidate.dataId) payload.data_id = candidate.dataId;
    if (candidate.dataCid) payload.data_cid = candidate.dataCid;
    payload.place_match_confidence = candidate.matchConfidence ?? "low";
    payload.provider = "serpapi";
  } else {
    payload.manual_entry = true;
    payload.continue_without_place = true;
  }

  if (candidate?.address?.trim()) payload.address = candidate.address.trim();
  if (candidate?.alternateNames?.length) payload.alternate_names = candidate.alternateNames.slice(0, 10);

  const handle = normaliseInstagramHandle(draft.instagramHandle);
  if (handle) {
    payload.ig_handle = handle;
    payload.ig_match_provenance = draft.instagramMatchProvenance ?? "manual_typed";
  }

  const website = resolveScanWebsite(draft);
  if (!website.ok) throw new Error("website_url is invalid");
  if (website.value) payload.website_url = website.value;

  const mapsUrl = draft.mapsUrl.trim();
  if (mapsUrl) payload.maps_url = mapsUrl;

  if (draft.intent) payload.intent = draft.intent;

  return payload;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isJobId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// F-13: retry-safe start
//
// The server commits the scan before it answers, so a lost response used to
// leave the owner looking at a network error with a paid scan already queued;
// pressing Start again queued a second one. Each submission now carries a key
// the server dedupes on. The same key is reused for a retry of the identical
// payload -- including after a refresh or a back-then-resubmit in the same
// tab -- and any change to the submission mints a new one. Storage is passed
// in, never read from `window` here, and every access is allowed to fail.
// ---------------------------------------------------------------------------

export const SCAN_SUBMISSION_STORAGE_KEY = "sme:scan-submission";
/** Long enough to cover a retry or a back navigation, short enough that a deliberate re-scan later is a new one. */
export const SCAN_SUBMISSION_TTL_MS = 30 * 60 * 1000;

export interface SubmissionKeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredSubmission { fingerprint: string; key: string; createdAt: number }

function readStoredSubmission(storage: SubmissionKeyStorage | null): StoredSubmission | null {
  try {
    const raw = storage?.getItem(SCAN_SUBMISSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSubmission>;
    return typeof parsed.fingerprint === "string" && typeof parsed.key === "string" && typeof parsed.createdAt === "number" ? (parsed as StoredSubmission) : null;
  } catch {
    return null;
  }
}

export function scanSubmissionKeyFor(payload: ScanStartPayload, storage: SubmissionKeyStorage | null, now: number, mint: () => string): string {
  const fingerprint = JSON.stringify(payload);
  const stored = readStoredSubmission(storage);
  const age = stored ? now - stored.createdAt : -1;
  if (stored && stored.fingerprint === fingerprint && age >= 0 && age < SCAN_SUBMISSION_TTL_MS) return stored.key;
  const key = mint();
  try {
    storage?.setItem(SCAN_SUBMISSION_STORAGE_KEY, JSON.stringify({ fingerprint, key, createdAt: now } satisfies StoredSubmission));
  } catch {
    // Without storage a retry in this mount still reuses the in-memory key the caller holds.
  }
  return key;
}

export function forgetScanSubmissionKey(storage: SubmissionKeyStorage | null): void {
  try {
    storage?.removeItem(SCAN_SUBMISSION_STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}

/** Session storage when the browser allows it, with an in-memory copy for this mount when it does not. */
export function layeredSubmissionStorage(memory: Map<string, string>, session: () => SubmissionKeyStorage | null): SubmissionKeyStorage {
  const tab = () => { try { return session(); } catch { return null; } };
  return {
    getItem: (key) => {
      try { const value = tab()?.getItem(key); if (value != null) return value; } catch { /* fall back to memory */ }
      return memory.get(key) ?? null;
    },
    setItem: (key, value) => { memory.set(key, value); try { tab()?.setItem(key, value); } catch { /* memory holds it */ } },
    removeItem: (key) => { memory.delete(key); try { tab()?.removeItem(key); } catch { /* memory cleared */ } },
  };
}
