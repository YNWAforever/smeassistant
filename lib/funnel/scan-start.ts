import type { IgMatchProvenance, MatchConfidence, MerchantCandidate } from "./business-search";

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
}

export function emptyScanDraft(market: ScanMarket, businessName = ""): ScanDraft {
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
  return Boolean(draft.businessName.trim()) && Boolean(draft.industry) && Boolean(draft.district) && hasBusinessIdentity(draft);
}

/** Field names are upstream's POST /api/scan/start contract, verbatim (CLAUDE.md §3.2.2). */
export interface ScanStartPayload {
  business_name: string;
  market: "HK" | "TW";
  locale: string;
  industry: string;
  district: string;
  objective: ScanObjective;
  place_id?: string;
  data_id?: string;
  data_cid?: string;
  place_match_confidence?: MatchConfidence;
  provider?: "serpapi";
  manual_entry?: boolean;
  ig_handle?: string;
  ig_match_provenance?: IgMatchProvenance;
  website_url?: string;
  address?: string;
  maps_url?: string;
  alternate_names?: string[];
}

export function normaliseInstagramHandle(value: string): string {
  return value.trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
}

export function buildScanStartPayload(draft: ScanDraft, locale: string): ScanStartPayload {
  const payload: ScanStartPayload = {
    business_name: draft.businessName.trim(),
    market: draft.market === "tw" ? "TW" : "HK",
    locale,
    industry: draft.industry,
    district: draft.district,
    objective: draft.objective,
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
  }

  if (candidate?.address?.trim()) payload.address = candidate.address.trim();
  if (candidate?.alternateNames?.length) payload.alternate_names = candidate.alternateNames.slice(0, 10);

  const handle = normaliseInstagramHandle(draft.instagramHandle);
  if (handle) {
    payload.ig_handle = handle;
    payload.ig_match_provenance = draft.instagramMatchProvenance ?? "manual_typed";
  }

  const website = draft.websiteUrl.trim() || candidate?.websiteUrl?.trim();
  if (website) payload.website_url = website;

  const mapsUrl = draft.mapsUrl.trim();
  if (mapsUrl) payload.maps_url = mapsUrl;

  return payload;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isJobId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
