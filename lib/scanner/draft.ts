import type { IgMatchProvenance } from "./ig-search/types";

export const SCANNER_DRAFT_KEY = "sme-scanner:draft:v1";

export type ScannerObjective = "more_leads" | "better_visibility" | "improve_trust" | "understand_performance";
export type PlaceMatchConfidence = "high" | "medium" | "low";

interface ScannerDraftCommon {
  market: "HK" | "TW";
  businessName: string;
  placeId: string | null;
  placeMatchConfidence: PlaceMatchConfidence | null;
  continueWithoutPlace: boolean;
  websiteUrl: string;
  instagramHandle: string;
  industry: string;
  district: string;
  objective: ScannerObjective;
}

export interface ScannerDraftV1 extends ScannerDraftCommon {
  version: 1;
}

export interface ScannerDraftV2 extends ScannerDraftCommon {
  version: 2;
  provider: "serpapi" | null;
  manualEntry: boolean;
  dataId: string | null;
  dataCid: string | null;
  alternateNames: string[];
  address: string;
  mapsUrl: string;
  facebookUrl: string;
  instagramMatchProvenance: IgMatchProvenance | null;
}

const OBJECTIVES = new Set<ScannerObjective>(["more_leads", "better_visibility", "improve_trust", "understand_performance"]);
const CONFIDENCE = new Set<PlaceMatchConfidence>(["high", "medium", "low"]);
const IG_PROVENANCE = new Set<IgMatchProvenance>(["manual_typed", "picker_confirmed", "gbp_cross_referenced"]);

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function validCommon(draft: Record<string, unknown>): boolean {
  return (draft.market === "HK" || draft.market === "TW")
    && isString(draft.businessName)
    && isString(draft.websiteUrl)
    && isString(draft.instagramHandle)
    && isString(draft.industry)
    && isString(draft.district)
    && typeof draft.continueWithoutPlace === "boolean"
    && isString(draft.objective)
    && OBJECTIVES.has(draft.objective as ScannerObjective)
    && (draft.placeId === null || isString(draft.placeId))
    && (draft.placeMatchConfidence === null
      || isString(draft.placeMatchConfidence) && CONFIDENCE.has(draft.placeMatchConfidence as PlaceMatchConfidence));
}

function migrateV1(draft: ScannerDraftV1): ScannerDraftV2 {
  return {
    ...draft,
    version: 2,
    placeId: null,
    placeMatchConfidence: null,
    provider: null,
    manualEntry: !draft.placeId && draft.continueWithoutPlace,
    dataId: null,
    dataCid: null,
    alternateNames: [],
    address: "",
    mapsUrl: "",
    facebookUrl: "",
    instagramMatchProvenance: null,
  };
}

function parseValue(value: unknown): ScannerDraftV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  if (!validCommon(draft)) return null;
  if (draft.version === 1) return migrateV1(draft as unknown as ScannerDraftV1);
  if (draft.version !== 2) return null;
  if ((draft.provider !== null && draft.provider !== "serpapi") || typeof draft.manualEntry !== "boolean") return null;
  if (draft.dataId !== null && !isString(draft.dataId)) return null;
  if (draft.dataCid !== null && !isString(draft.dataCid)) return null;
  if (!Array.isArray(draft.alternateNames) || !draft.alternateNames.every(isString)) return null;
  if (!isString(draft.address) || !isString(draft.mapsUrl) || !isString(draft.facebookUrl)) return null;
  // Additive since the v2 envelope shipped, so a draft written before this
  // feature is valid and simply has no provenance -- normalized to null here
  // rather than bumping to v3, which would discard every in-flight draft for
  // one optional field.
  if (
    draft.instagramMatchProvenance !== undefined
    && draft.instagramMatchProvenance !== null
    && !(isString(draft.instagramMatchProvenance) && IG_PROVENANCE.has(draft.instagramMatchProvenance as IgMatchProvenance))
  ) {
    return null;
  }
  return {
    ...(draft as unknown as ScannerDraftV2),
    instagramMatchProvenance: (draft.instagramMatchProvenance ?? null) as IgMatchProvenance | null,
  };
}

export function parseScannerDraft(raw: string | null): ScannerDraftV2 | null {
  if (!raw) return null;
  try {
    return parseValue(JSON.parse(raw));
  } catch {
    return null;
  }
}

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readScannerDraft(storage: Storage | null = sessionStorageOrNull()): ScannerDraftV2 | null {
  if (!storage) return null;
  try {
    return parseScannerDraft(storage.getItem(SCANNER_DRAFT_KEY));
  } catch {
    return null;
  }
}

export function writeScannerDraft(
  draft: ScannerDraftV1 | ScannerDraftV2,
  storage: Storage | null = sessionStorageOrNull(),
): boolean {
  const normalized = parseValue(draft);
  if (!storage || !normalized) return false;
  try {
    storage.setItem(SCANNER_DRAFT_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function preserveScannerDraft(storage: Storage | null = sessionStorageOrNull()): boolean {
  const draft = readScannerDraft(storage);
  return draft ? writeScannerDraft(draft, storage) : false;
}

export function canSubmitScannerDraft(input: ScannerDraftV1 | ScannerDraftV2): boolean {
  const draft = parseValue(input);
  if (!draft || !draft.businessName.trim() || !draft.industry || !draft.district || !OBJECTIVES.has(draft.objective)) return false;
  if (draft.manualEntry) {
    return !draft.placeId && !draft.dataId && !draft.dataCid && draft.provider === null && draft.placeMatchConfidence === null;
  }
  const hasProviderIdentity = Boolean(draft.placeId || draft.dataId || draft.dataCid);
  return hasProviderIdentity && draft.provider === "serpapi" && draft.placeMatchConfidence !== null;
}

export function emptyScannerDraft(market: "HK" | "TW"): ScannerDraftV2 {
  return {
    version: 2,
    market,
    businessName: "",
    placeId: null,
    placeMatchConfidence: null,
    continueWithoutPlace: false,
    websiteUrl: "",
    instagramHandle: "",
    industry: "",
    district: "",
    objective: "more_leads",
    provider: null,
    manualEntry: false,
    dataId: null,
    dataCid: null,
    alternateNames: [],
    address: "",
    mapsUrl: "",
    facebookUrl: "",
    instagramMatchProvenance: null,
  };
}
