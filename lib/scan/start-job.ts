import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IgMatchProvenance } from "@sme-scanner/contracts";
import { supabaseServer } from "@/lib/supabase/admin";

/**
 * Validation and insert for `POST /api/scan/start`, lifted verbatim from
 * upstream's route handler so that server-side callers (the Phase 6 rescan
 * route) can queue a job through the same contract while attaching a
 * workspace. The HTTP route never forwards `workspace_id` / `location_id`
 * from a client body: attribution is a server-side decision (CLAUDE.md 3.2.2).
 */
export type ScanMarket = "HK" | "TW";
export type ScanLocale = "en" | "zh-HK" | "zh-TW";
export type ScanObjective = "more_leads" | "better_visibility" | "improve_trust" | "understand_performance";
export type PlaceMatchConfidence = "high" | "medium" | "low";

export interface ScanStartInput {
  businessName: string;
  instagramHandle: string;
  instagramMatchProvenance: IgMatchProvenance | null;
  websiteUrl: string;
  industry: string;
  district: string;
  locale: ScanLocale;
  market: ScanMarket;
  objective: ScanObjective;
  placeId: string | null;
  dataId: string | null;
  dataCid: string | null;
  placeMatchConfidence: PlaceMatchConfidence | null;
  provider: "serpapi" | null;
  manualEntry: boolean;
  alternateNames: string[];
  address: string;
  mapsUrl: string;
  facebookUrl: string;
  parentJobId: string | null;
  userRole: string | null;
}

export type ScanStartParse = { ok: true; input: ScanStartInput } | { ok: false; error: string };

const IG_MATCH_PROVENANCE = new Set<string>(["manual_typed", "picker_confirmed", "gbp_cross_referenced"]);
const LOCALES = new Set<string>(["en", "zh-HK", "zh-TW"]);
const OBJECTIVES = new Set<string>(["more_leads", "better_visibility", "improve_trust", "understand_performance"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isOptionalLimitedString(value: unknown, maxLength: number) {
  return value == null || (typeof value === "string" && value.trim().length <= maxLength);
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseAlternateNames(value: unknown): { valid: boolean; names: string[] } {
  if (value == null) return { valid: true, names: [] };
  if (!Array.isArray(value) || value.length > 10) return { valid: false, names: [] };
  if (value.some((name) => typeof name !== "string" || !name.trim() || name.trim().length > 160)) {
    return { valid: false, names: [] };
  }
  return { valid: true, names: value.map((name) => (name as string).trim()) };
}

function isOptionalHttpUrl(value: unknown) {
  if (value == null || value === "") return true;
  if (typeof value !== "string" || value.trim().length > 2048) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Upstream's validation, same checks in the same order with the same error strings. */
export function parseScanStartBody(raw: unknown): ScanStartParse {
  const body: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

  const businessName = typeof body.business_name === "string" ? body.business_name.trim() : "";
  const instagramHandle = typeof body.ig_handle === "string"
    ? body.ig_handle.trim().replace(/^@+/, "")
    : "";
  // A provenance with no handle is a claim about nothing, and an unrecognized
  // value is dropped rather than stored: input_snapshot feeds the confidence
  // grader, so an unknown string there would fall through to the manual ceiling
  // anyway while looking like real provenance in the record.
  const instagramMatchProvenance = instagramHandle
    && typeof body.ig_match_provenance === "string"
    && IG_MATCH_PROVENANCE.has(body.ig_match_provenance)
    ? (body.ig_match_provenance as IgMatchProvenance)
    : null;
  const websiteUrl = typeof body.website_url === "string" ? body.website_url.trim() : "";
  const industry = typeof body.industry === "string" ? body.industry : "";
  const district = typeof body.district === "string" ? body.district : "";
  const locale = typeof body.locale === "string" ? body.locale : "";
  const market = body.market;
  const placeId = typeof body.place_id === "string" && body.place_id.trim()
    ? body.place_id.trim()
    : null;
  const dataId = normalizeOptionalString(body.data_id);
  const dataCid = normalizeOptionalString(body.data_cid);
  const placeMatchConfidence = body.place_match_confidence;
  const continueWithoutPlace = body.continue_without_place === true;
  const hasProviderIdentity = Boolean(placeId || dataId || dataCid);
  const provider = body.provider == null
    ? (hasProviderIdentity ? "serpapi" : null)
    : body.provider;
  const manualEntry = typeof body.manual_entry === "boolean"
    ? body.manual_entry
    : continueWithoutPlace;
  const alternateNames = parseAlternateNames(body.alternate_names);
  const address = normalizeOptionalString(body.address) ?? "";
  const mapsUrl = normalizeOptionalString(body.maps_url) ?? "";
  const facebookUrl = normalizeOptionalString(body.facebook_url) ?? "";
  const objective = body.objective;
  const parentJobId = typeof body.parent_job_id === "string" && body.parent_job_id
    ? body.parent_job_id
    : null;
  const userRole = typeof body.user_role === "string" && body.user_role
    ? body.user_role
    : null;

  if (!businessName) return { ok: false, error: "business_name is required" };
  if (market !== "HK" && market !== "TW") return { ok: false, error: "market must be HK or TW" };
  if (!industry || !district) return { ok: false, error: "industry and district are required" };
  if (!LOCALES.has(locale)) return { ok: false, error: "locale is invalid" };
  if (!OBJECTIVES.has(String(objective))) return { ok: false, error: "objective is invalid" };
  const confidenceValid = placeMatchConfidence === "high" ||
    placeMatchConfidence === "medium" ||
    placeMatchConfidence === "low";
  const evidenceValid =
    isOptionalLimitedString(body.place_id, 256) &&
    isOptionalLimitedString(body.data_id, 256) &&
    isOptionalLimitedString(body.data_cid, 256) &&
    isOptionalLimitedString(body.address, 500) &&
    alternateNames.valid &&
    isOptionalHttpUrl(body.maps_url) &&
    isOptionalHttpUrl(body.facebook_url);
  const providerSelectionValid =
    provider === "serpapi" && hasProviderIdentity && confidenceValid && !manualEntry;
  const manualSelectionValid =
    provider == null && !hasProviderIdentity && placeMatchConfidence == null && manualEntry;
  const manualFlagConsistent = typeof body.manual_entry !== "boolean" || manualEntry === continueWithoutPlace;
  if (!evidenceValid || !manualFlagConsistent || (!providerSelectionValid && !manualSelectionValid)) {
    return { ok: false, error: "confirm a SerpApi business or use manual entry" };
  }
  if (parentJobId && !UUID_RE.test(parentJobId)) return { ok: false, error: "parent_job_id is invalid" };

  return {
    ok: true,
    input: {
      businessName,
      instagramHandle,
      instagramMatchProvenance,
      websiteUrl,
      industry,
      district,
      locale: locale as ScanLocale,
      market,
      objective: String(objective) as ScanObjective,
      placeId,
      dataId,
      dataCid,
      placeMatchConfidence: confidenceValid ? (placeMatchConfidence as PlaceMatchConfidence) : null,
      provider: provider === "serpapi" ? "serpapi" : null,
      manualEntry,
      alternateNames: alternateNames.names,
      address,
      mapsUrl,
      facebookUrl,
      parentJobId,
      userRole,
    },
  };
}

/**
 * Server-side attribution. Never derived from a client request body. Either
 * key is written only when present, so a queued scan from the public funnel
 * inserts exactly upstream's row (audit_jobs.location_id arrives with the
 * Phase 2 workspace-layer migration).
 */
export interface ScanJobAttribution {
  workspaceId?: string | null;
  locationId?: string | null;
}

/** The `audit_jobs` row upstream inserts, plus optional server-side attribution. */
export function buildScanJobInsert(input: ScanStartInput, attribution: ScanJobAttribution = {}): Record<string, unknown> {
  const inputSnapshot = {
    version: 2,
    locale: input.locale,
    market: input.market,
    businessName: input.businessName,
    provider: input.provider,
    manualEntry: input.manualEntry,
    placeId: input.placeId,
    dataId: input.dataId,
    dataCid: input.dataCid,
    placeMatchConfidence: input.placeMatchConfidence,
    continueWithoutPlace: input.manualEntry,
    alternateNames: input.alternateNames,
    address: input.address,
    mapsUrl: input.mapsUrl,
    facebookUrl: input.facebookUrl,
    websiteUrl: input.websiteUrl,
    instagramHandle: input.instagramHandle,
    instagramMatchProvenance: input.instagramMatchProvenance,
    industry: input.industry,
    district: input.district,
    objective: input.objective,
  };

  return {
    business_name: input.businessName,
    ig_handle: input.instagramHandle || null,
    website_url: input.websiteUrl || null,
    industry: input.industry,
    district: input.district,
    user_role: input.userRole,
    status: "queued",
    share_slug: randomBytes(18).toString("base64url"),
    region: input.market.toLowerCase(),
    business_objective: input.objective,
    input_snapshot: inputSnapshot,
    place_id: input.placeId,
    place_match_confidence: input.placeId ? input.placeMatchConfidence : null,
    parent_job_id: input.parentJobId,
    ...(attribution.workspaceId ? { workspace_id: attribution.workspaceId } : {}),
    ...(attribution.locationId ? { location_id: attribution.locationId } : {}),
  };
}

export type ScanJobInsertResult = { ok: true; jobId: string } | { ok: false; error: unknown };

export async function insertScanJob(
  input: ScanStartInput,
  attribution: ScanJobAttribution = {},
  client: SupabaseClient = supabaseServer(),
): Promise<ScanJobInsertResult> {
  const { data: row, error } = await client
    .from("audit_jobs")
    .insert(buildScanJobInsert(input, attribution))
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: error ?? new Error("audit_jobs insert returned no row") };
  return { ok: true, jobId: (row as { id: string }).id };
}
