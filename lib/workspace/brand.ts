import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEvent } from "@/lib/workspace/audit";

/**
 * Brand profile read/write (CLAUDE.md §3.2.3 `brand_profiles`, §3.9 owner-only
 * settings). One row per workspace, upserted on the primary key; the claim
 * route seeds the defaults, so a missing row reads as the defaults here too.
 * Every save writes a `brand.updated` audit event (§3.11).
 */
export const BRAND_VOICES = ["warm", "professional", "playful", "direct"] as const;
export type BrandVoice = (typeof BRAND_VOICES)[number];

export const BRAND_LANGUAGES = ["zh-HK", "zh-TW", "en"] as const;
export type BrandLanguage = (typeof BRAND_LANGUAGES)[number];

export interface BrandProfile {
  workspaceId: string;
  voice: BrandVoice;
  approvedClaims: string[];
  prohibitedTerms: string[];
  languages: BrandLanguage[];
  facts: Record<string, string>;
  updatedAt: string | null;
}

export interface BrandInput {
  voice: BrandVoice;
  approved_claims: string[];
  prohibited_terms: string[];
  languages: BrandLanguage[];
  facts: Record<string, string>;
}

export type BrandParse = { ok: true; brand: BrandInput } | { ok: false; error: string };

interface BrandRow {
  workspace_id: string;
  voice: string | null;
  approved_claims: string[] | null;
  prohibited_terms: string[] | null;
  languages: string[] | null;
  facts: unknown;
  updated_at: string | null;
}

const MAX_LIST_ITEMS = 50;
const MAX_ITEM_LENGTH = 200;
const MAX_FACTS = 50;
const MAX_FACT_KEY = 80;
const MAX_FACT_VALUE = 500;
const VOICE_SET = new Set<string>(BRAND_VOICES);
const LANGUAGE_SET = new Set<string>(BRAND_LANGUAGES);

function isVoice(value: unknown): value is BrandVoice {
  return typeof value === "string" && VOICE_SET.has(value);
}

function stringList(value: unknown, field: string): { ok: true; list: string[] } | { ok: false; error: string } {
  if (value == null) return { ok: true, list: [] };
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) return { ok: false, error: `${field} must be a list of at most ${MAX_LIST_ITEMS} entries` };
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return { ok: false, error: `${field} entries must be strings` };
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_ITEM_LENGTH) return { ok: false, error: `${field} entries must be at most ${MAX_ITEM_LENGTH} characters` };
    list.push(trimmed);
  }
  return { ok: true, list: [...new Set(list)] };
}

function factsRecord(value: unknown): { ok: true; facts: Record<string, string> } | { ok: false; error: string } {
  if (value == null) return { ok: true, facts: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "facts must be an object of strings" };
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_FACTS) return { ok: false, error: `facts must have at most ${MAX_FACTS} entries` };
  const facts: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key) continue;
    if (key.length > MAX_FACT_KEY) return { ok: false, error: `facts keys must be at most ${MAX_FACT_KEY} characters` };
    if (typeof rawValue !== "string") return { ok: false, error: "facts values must be strings" };
    if (rawValue.length > MAX_FACT_VALUE) return { ok: false, error: `facts values must be at most ${MAX_FACT_VALUE} characters` };
    facts[key] = rawValue.trim();
  }
  return { ok: true, facts };
}

/** Validate a PUT body. Unknown keys are ignored; every listed field is checked. */
export function parseBrandBody(raw: unknown): BrandParse {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (!isVoice(body.voice)) return { ok: false, error: "voice must be warm, professional, playful or direct" };
  const claims = stringList(body.approved_claims, "approved_claims");
  if (!claims.ok) return claims;
  const prohibited = stringList(body.prohibited_terms, "prohibited_terms");
  if (!prohibited.ok) return prohibited;
  const languages = stringList(body.languages, "languages");
  if (!languages.ok) return languages;
  if (languages.list.some((l) => !LANGUAGE_SET.has(l))) return { ok: false, error: "languages must be zh-HK, zh-TW or en" };
  if (!languages.list.length) return { ok: false, error: "languages must include at least one language" };
  const facts = factsRecord(body.facts);
  if (!facts.ok) return facts;
  return {
    ok: true,
    brand: {
      voice: body.voice,
      approved_claims: claims.list,
      prohibited_terms: prohibited.list,
      languages: languages.list as BrandLanguage[],
      facts: facts.facts,
    },
  };
}

export function defaultBrand(workspaceId: string): BrandProfile {
  return { workspaceId, voice: "warm", approvedClaims: [], prohibitedTerms: [], languages: ["zh-HK"], facts: {}, updatedAt: null };
}

function rowToBrand(row: BrandRow): BrandProfile {
  const facts: Record<string, string> = {};
  if (row.facts && typeof row.facts === "object" && !Array.isArray(row.facts)) {
    for (const [key, value] of Object.entries(row.facts as Record<string, unknown>)) if (typeof value === "string") facts[key] = value;
  }
  return {
    workspaceId: row.workspace_id,
    voice: isVoice(row.voice) ? row.voice : "warm",
    approvedClaims: Array.isArray(row.approved_claims) ? row.approved_claims.filter((c): c is string => typeof c === "string") : [],
    prohibitedTerms: Array.isArray(row.prohibited_terms) ? row.prohibited_terms.filter((c): c is string => typeof c === "string") : [],
    languages: Array.isArray(row.languages) ? (row.languages.filter((l): l is BrandLanguage => LANGUAGE_SET.has(l)) as BrandLanguage[]) : ["zh-HK"],
    facts,
    updatedAt: row.updated_at,
  };
}

export async function getBrand(db: SupabaseClient, workspaceId: string): Promise<BrandProfile> {
  const { data, error } = await db.from("brand_profiles").select("*").eq("workspace_id", workspaceId).maybeSingle<BrandRow>();
  if (error) throw new Error("brand lookup failed");
  return data ? rowToBrand(data) : defaultBrand(workspaceId);
}

export interface PutBrandInput {
  workspaceId: string;
  actorId: string;
  brand: BrandInput;
  locale?: string | null;
  ipHash?: string | null;
  now?: Date;
}

export async function putBrand(db: SupabaseClient, input: PutBrandInput): Promise<BrandProfile> {
  const now = (input.now ?? new Date()).toISOString();
  const { data, error } = await db
    .from("brand_profiles")
    .upsert(
      {
        workspace_id: input.workspaceId,
        voice: input.brand.voice,
        approved_claims: input.brand.approved_claims,
        prohibited_terms: input.brand.prohibited_terms,
        languages: input.brand.languages,
        facts: input.brand.facts,
        updated_at: now,
      },
      { onConflict: "workspace_id" },
    )
    .select("*")
    .single<BrandRow>();
  if (error || !data) throw new Error("brand upsert failed");

  await recordEvent(db, {
    workspaceId: input.workspaceId,
    actorType: "user",
    actorId: input.actorId,
    event: "brand.updated",
    entityType: "brand_profile",
    entityId: input.workspaceId,
    locale: input.locale ?? null,
    ipHash: input.ipHash ?? null,
    payload: {
      voice: input.brand.voice,
      languages: input.brand.languages,
      approved_claims: input.brand.approved_claims.length,
      prohibited_terms: input.brand.prohibited_terms.length,
      facts: Object.keys(input.brand.facts).length,
    },
  });

  return rowToBrand(data);
}
